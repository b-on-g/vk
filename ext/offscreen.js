const audio = document.getElementById( 'audio' )
audio.volume = 0.7

let current_audio = null
let last_blob_url = ''

function broadcast( type, payload ) {
	chrome.runtime.sendMessage( { target: 'popup', type, ...payload } ).catch( () => {} )
}

audio.addEventListener( 'play', () => broadcast( 'state', { playing: true } ) )
audio.addEventListener( 'pause', () => broadcast( 'state', { playing: false } ) )
audio.addEventListener( 'timeupdate', () => broadcast( 'state', { current_time: audio.currentTime } ) )
audio.addEventListener( 'loadedmetadata', () => broadcast( 'state', { duration: audio.duration } ) )
audio.addEventListener( 'ended', () => broadcast( 'ended', { audio: current_audio } ) )
audio.addEventListener( 'error', () => {
	broadcast( 'error', {
		code: audio.error?.code,
		message: audio.error?.message || 'audio error',
	} )
} )

function play_track( meta, buffer, mime, opts ) {
	const start_at = Number( opts?.start_at ) || 0
	const autoplay = opts?.autoplay !== false
	current_audio = meta
	if ( last_blob_url ) {
		URL.revokeObjectURL( last_blob_url )
		last_blob_url = ''
	}
	if ( buffer ) {
		const blob = new Blob( [ buffer ], { type: mime || 'audio/mpeg' } )
		last_blob_url = URL.createObjectURL( blob )
		audio.src = last_blob_url
	} else if ( meta?.url ) {
		audio.src = meta.url
	} else {
		broadcast( 'error', { message: 'no source' } )
		return
	}
	if ( start_at > 0 ) {
		const seek = () => {
			try { audio.currentTime = start_at } catch {}
			audio.removeEventListener( 'loadedmetadata', seek )
		}
		audio.addEventListener( 'loadedmetadata', seek )
	}
	broadcast( 'state', { current_audio: meta, current_time: start_at, duration: 0, playing: autoplay } )
	if ( autoplay ) {
		audio.play().catch( e => broadcast( 'error', { message: String( e ) } ) )
	}
}

chrome.runtime.onMessage.addListener( ( msg, _sender, reply ) => {
	if ( msg?.target !== 'offscreen' ) return
	switch ( msg.type ) {
		case 'play_track':
			play_track( msg.audio, msg.buffer, msg.mime, { start_at: msg.start_at, autoplay: msg.autoplay } )
			reply( { ok: true } )
			return true
		case 'pause':
			audio.pause()
			reply( { ok: true } )
			return true
		case 'resume':
			audio.play().catch( () => {} )
			reply( { ok: true } )
			return true
		case 'seek':
			if ( typeof msg.time === 'number' ) audio.currentTime = msg.time
			reply( { ok: true } )
			return true
		case 'volume':
			if ( typeof msg.value === 'number' ) audio.volume = msg.value
			reply( { ok: true } )
			return true
		case 'get_state':
			reply( {
				playing: !audio.paused,
				current_time: audio.currentTime || 0,
				duration: isFinite( audio.duration ) ? audio.duration : 0,
				current_audio,
			} )
			return true
	}
} )
