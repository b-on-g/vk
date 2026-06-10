// Service worker. Тяжёлая работа (HLS-fetch, AES-CBC decrypt, TS demux, IDB
// write) живёт ЗДЕСЬ — раньше она была в content.js и байты через
// chrome.runtime.sendMessage (~8MB base64) убивали SW: atob + аллокация большого
// буфера ловили Chrome'овский «зависший воркер» killer, контекст помечался
// invalid, и любой следующий sendMessage из content.js падал с «Extension
// context invalidated» (не из-за reload'а расширения — из-за крэша воркера).
//
// Теперь content.js шлёт только { type:'download_track', audio } — крохотный
// JSON. Бинарь не выходит за границу chrome-extension origin.

const OFFSCREEN_URL = 'bog/vk/ext/offscreen.html'
const APP_URL = 'index.html'
const PENDING_DB = 'bog_vk_pending'
const PENDING_STORE = 'pending'

let creating = null

// Открываем app в табе, не в popup'е. Popup мёртв для нашей нагрузки: drain
// pending → save_blob → file-land king_grab (PoW лочит main thread на 1-10с)
// + 7MB sand/seal pack → Chrome убивает «unresponsive» popup, плюс popup сам
// закрывается от любого клика мимо. Таб всё это переживает.
chrome.action.onClicked.addListener( async () => {
	const url = chrome.runtime.getURL( APP_URL )
	try {
		const tabs = await chrome.tabs.query( { url } )
		if ( tabs && tabs.length ) {
			const tab = tabs[ 0 ]
			await chrome.tabs.update( tab.id, { active: true } )
			if ( tab.windowId != null ) await chrome.windows.update( tab.windowId, { focused: true } )
			return
		}
		await chrome.tabs.create( { url } )
	} catch ( e ) {
		console.warn( '[bog_vk_ext] open tab failed', e )
	}
} )

async function ensure_offscreen() {
	if ( await chrome.offscreen.hasDocument() ) return
	if ( creating ) return creating
	creating = chrome.offscreen.createDocument( {
		url: OFFSCREEN_URL,
		reasons: [ 'AUDIO_PLAYBACK' ],
		justification: 'Keep VK music playing while the popup is closed',
	} )
	try {
		await creating
	} finally {
		creating = null
	}
}

// --- IDB pending store -----------------------------------------------------

function open_pending_db() {
	return new Promise( ( resolve, reject ) => {
		const req = indexedDB.open( PENDING_DB, 1 )
		req.onupgradeneeded = () => {
			const db = req.result
			if ( !db.objectStoreNames.contains( PENDING_STORE ) ) {
				db.createObjectStore( PENDING_STORE, { keyPath: 'key' } )
			}
		}
		req.onsuccess = () => resolve( req.result )
		req.onerror = () => reject( req.error )
	} )
}

async function save_audio_to_idb( audio, mime, buf ) {
	const key = audio.owner_id + '_' + audio.id
	const db = await open_pending_db()
	try {
		await new Promise( ( resolve, reject ) => {
			const tx = db.transaction( [ PENDING_STORE ], 'readwrite' )
			tx.objectStore( PENDING_STORE ).put( {
				key,
				audio,
				mime: mime || 'audio/aac',
				buf,
				ts: Date.now(),
			} )
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject( tx.error )
			tx.onabort = () => reject( tx.error )
		} )
	} finally {
		db.close()
	}
	chrome.runtime.sendMessage( { target: 'popup', type: 'pending_added', key } ).catch( () => {} )
}

// --- HLS download + decrypt + demux ----------------------------------------

async function fetch_buf( url ) {
	const r = await fetch( url, { credentials: 'omit' } )
	if ( !r.ok ) throw new Error( 'HTTP ' + r.status + ' ' + url )
	return r.arrayBuffer()
}

function parse_m3u8( text, base ) {
	const lines = text.split( '\n' )
	let key_url = '', key_iv = ''
	const segments = []
	for ( const raw of lines ) {
		const l = raw.trim()
		if ( l.startsWith( '#EXT-X-KEY:' ) ) {
			const u = l.match( /URI="([^"]+)"/ )
			if ( u ) key_url = u[ 1 ].startsWith( 'http' ) ? u[ 1 ] : base + u[ 1 ]
			const iv = l.match( /IV=0x([0-9a-fA-F]+)/ )
			if ( iv ) key_iv = iv[ 1 ]
		} else if ( l && !l.startsWith( '#' ) ) {
			segments.push( l.startsWith( 'http' ) ? l : base + l )
		}
	}
	return { segments, key_url, key_iv }
}

async function decrypt( buf, cryptoKey, idx, iv_hex ) {
	let iv
	if ( iv_hex ) {
		const bytes = new Uint8Array( 16 )
		for ( let i = 0; i < 16 && i * 2 < iv_hex.length; i++ ) {
			bytes[ i ] = parseInt( iv_hex.substr( i * 2, 2 ), 16 )
		}
		iv = bytes.buffer
	} else {
		const b = new Uint8Array( 16 )
		b[ 15 ] = idx & 0xff
		b[ 14 ] = ( idx >> 8 ) & 0xff
		b[ 13 ] = ( idx >> 16 ) & 0xff
		b[ 12 ] = ( idx >> 24 ) & 0xff
		iv = b.buffer
	}
	return crypto.subtle.decrypt( { name: 'AES-CBC', iv }, cryptoKey, buf )
}

function demux_ts( ts ) {
	const groups = new Map()
	for ( let pos = 0; pos + 188 <= ts.length; pos += 188 ) {
		if ( ts[ pos ] !== 0x47 ) continue
		const pusi = !!( ts[ pos + 1 ] & 0x40 )
		const pid = ( ( ts[ pos + 1 ] & 0x1f ) << 8 ) | ts[ pos + 2 ]
		const afc = ( ts[ pos + 3 ] >> 4 ) & 0x03
		if ( pid === 0 || pid === 0x1fff ) continue
		if ( !( afc & 0x01 ) ) continue
		let off = 4
		if ( afc & 0x02 ) off += 1 + ts[ pos + 4 ]
		if ( off >= 188 ) continue
		if ( !groups.has( pid ) ) groups.set( pid, [] )
		groups.get( pid ).push( { pusi, data: ts.slice( pos + off, pos + 188 ) } )
	}
	for ( const [ , chunks ] of groups ) {
		const first = chunks.find( c => c.pusi )
		if ( !first ) continue
		const d = first.data
		if ( d.length < 9 || d[ 0 ] !== 0x00 || d[ 1 ] !== 0x00 || d[ 2 ] !== 0x01 ) continue
		if ( d[ 3 ] < 0xc0 || d[ 3 ] > 0xdf ) continue
		const parts = []
		for ( const c of chunks ) {
			if ( c.pusi ) {
				const p = c.data
				if ( p.length < 9 || p[ 0 ] !== 0x00 || p[ 1 ] !== 0x00 || p[ 2 ] !== 0x01 ) continue
				const hdrLen = 9 + p[ 8 ]
				if ( hdrLen < p.length ) parts.push( p.slice( hdrLen ) )
			} else {
				parts.push( c.data )
			}
		}
		const total = parts.reduce( ( s, p ) => s + p.length, 0 )
		if ( !total ) continue
		const out = new Uint8Array( total )
		let o = 0
		for ( const p of parts ) { out.set( p, o ); o += p.length }
		return out
	}
	return null
}

function detect_mime( bytes ) {
	if ( bytes[ 0 ] === 0xff && ( bytes[ 1 ] & 0xf0 ) === 0xf0 ) return 'audio/aac'
	if ( bytes[ 0 ] === 0xff && ( bytes[ 1 ] & 0xe0 ) === 0xe0 ) return 'audio/mpeg'
	if ( bytes[ 0 ] === 0x49 && bytes[ 1 ] === 0x44 && bytes[ 2 ] === 0x33 ) return 'audio/mpeg'
	return 'audio/aac'
}

async function get_vk_token() {
	const r = await chrome.storage.local.get( [ 'vk_token' ] )
	return r?.vk_token || ''
}

async function refresh_url( audio ) {
	const token = await get_vk_token()
	if ( !token ) throw new Error( 'Нет токена — открой раздел Музыка на vk.com, токен подцепится сам' )
	const id_str = audio.access_key
		? audio.owner_id + '_' + audio.id + '_' + audio.access_key
		: audio.owner_id + '_' + audio.id
	const body = new URLSearchParams( {
		audios: id_str,
		access_token: token,
		v: '5.275',
		client_id: '6287487',
	} )
	const r = await fetch( 'https://api.vk.com/method/audio.getById', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
		credentials: 'include',
	} )
	const data = await r.json()
	if ( data && data.error ) throw new Error( data.error.error_msg || 'VK API error' )
	const fresh = data && data.response && data.response[ 0 ]
	if ( !fresh || !fresh.url ) throw new Error( 'VK не отдал URL (DRM или удалён)' )
	return fresh
}

async function download_track( audio ) {
	let target = audio
	if ( !target.url ) {
		const fresh = await refresh_url( audio )
		target = Object.assign( {}, audio, fresh )
	}
	const m3u8_resp = await fetch( target.url )
	if ( !m3u8_resp.ok ) throw new Error( 'm3u8 ' + m3u8_resp.status )
	const text = await m3u8_resp.text()
	const base = target.url.substring( 0, target.url.lastIndexOf( '/' ) + 1 )
	const { segments, key_url, key_iv } = parse_m3u8( text, base )
	if ( !segments.length ) throw new Error( 'No segments' )

	let cryptoKey = null
	if ( key_url ) {
		const k = await fetch_buf( key_url )
		cryptoKey = await crypto.subtle.importKey( 'raw', k, 'AES-CBC', false, [ 'decrypt' ] )
	}

	const chunks = []
	for ( let i = 0; i < segments.length; i++ ) {
		let buf = await fetch_buf( segments[ i ] )
		const first = new Uint8Array( buf )[ 0 ]
		if ( cryptoKey && first !== 0x47 ) buf = await decrypt( buf, cryptoKey, i, key_iv )
		chunks.push( buf )
	}

	const total = chunks.reduce( ( s, c ) => s + c.byteLength, 0 )
	const merged = new Uint8Array( total )
	let off = 0
	for ( const c of chunks ) { merged.set( new Uint8Array( c ), off ); off += c.byteLength }

	let raw = merged
	let mime = detect_mime( merged )
	if ( merged[ 0 ] === 0x47 ) {
		const audio_bytes = demux_ts( merged )
		if ( audio_bytes ) { raw = audio_bytes; mime = 'audio/aac' }
	}

	// Кладём чистую meta (без url — он одноразовый/сессионный) — popup при
	// чтении сам обновит url через своё API при необходимости.
	const meta = {
		id: target.id,
		owner_id: target.owner_id,
		title: target.title || '',
		artist: target.artist || '',
		duration: target.duration || 0,
		url: target.url || '',
		access_key: target.access_key || audio.access_key || '',
	}
	await save_audio_to_idb( meta, mime, raw )
}

// --- Message routing -------------------------------------------------------

chrome.runtime.onMessage.addListener( ( msg, _sender, reply ) => {
	if ( msg?.target !== 'background' ) return
	if ( msg.type === 'ensure_offscreen' ) {
		ensure_offscreen()
			.then( () => reply( { ok: true } ) )
			.catch( e => reply( { ok: false, error: String( e ) } ) )
		return true
	}
} )

// Длинный download через chrome.runtime.connect port. Через sendMessage
// reply-канал имеет timeout/SW dies → «channel closed». Port держит SW
// живым явно: пока порт connected, SW не убивают.
chrome.runtime.onConnect.addListener( ( port ) => {
	if ( port.name !== 'bog_vk_download' ) return
	port.onMessage.addListener( async ( msg ) => {
		if ( msg?.type !== 'download_track' ) return
		try {
			await download_track( msg.audio )
			try { port.postMessage( { type: 'done' } ) } catch {}
		} catch ( e ) {
			try { port.postMessage( { type: 'error', error: String( e?.message || e ) } ) } catch {}
		}
	} )
} )
