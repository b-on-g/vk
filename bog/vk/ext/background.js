const OFFSCREEN_URL = 'bog/vk/ext/offscreen.html'
const PENDING_DB = 'bog_vk_pending'
const PENDING_STORE = 'pending'

let creating = null

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

async function save_audio_to_idb( audio, mime, buf_b64 ) {
	const bin = atob( buf_b64 )
	const buf = new Uint8Array( bin.length )
	for ( let i = 0; i < bin.length; i++ ) buf[ i ] = bin.charCodeAt( i )
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
	// Кидаем popup'у (если открыт) — он подписан и дренит очередь сразу.
	// Если popup закрыт — никто не услышит, дренаж случится при следующем открытии.
	chrome.runtime.sendMessage( { target: 'popup', type: 'pending_added', key } ).catch( () => {} )
}

chrome.runtime.onMessage.addListener( ( msg, _sender, reply ) => {
	if ( msg?.target !== 'background' ) return
	if ( msg.type === 'ensure_offscreen' ) {
		ensure_offscreen()
			.then( () => reply( { ok: true } ) )
			.catch( e => reply( { ok: false, error: String( e ) } ) )
		return true
	}
	if ( msg.type === 'save_audio' ) {
		save_audio_to_idb( msg.audio, msg.mime, msg.buf_b64 )
			.then( () => reply( { ok: true } ) )
			.catch( e => reply( { ok: false, error: String( e ) } ) )
		return true
	}
} )
