const OFFSCREEN_URL = 'bog/vk/ext/offscreen.html'

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

chrome.runtime.onMessage.addListener( ( msg, _sender, reply ) => {
	if ( msg?.target !== 'background' ) return
	if ( msg.type === 'ensure_offscreen' ) {
		ensure_offscreen()
			.then( () => reply( { ok: true } ) )
			.catch( e => reply( { ok: false, error: String( e ) } ) )
		return true
	}
} )
