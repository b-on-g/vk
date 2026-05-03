// Page-world script. Loaded via <script src="chrome-extension://.../inject.js">
// to bypass strict CSP on vk.com (inline scripts blocked).
//
// Patches window.fetch and XMLHttpRequest, scans api.vk.com requests/responses
// for `access_token` and audio metadata, posts findings via window.postMessage to
// the content script in the isolated world.

(function () {
	'use strict'

	const TOKEN_RE = /access_token=([^&\s'"]+)/
	const VK_TOKEN_RE = /vk1\.a\.[A-Za-z0-9_-]+/
	const AUDIO_METHODS = /^audio\.(get|search|getById|getRecommendations|getPopular|getPlaylist)$/

	function find_token() {
		for (let i = 0; i < arguments.length; i++) {
			const s = String(arguments[i] || '')
			const m = s.match(TOKEN_RE)
			if (m && /^vk1\.a\./.test(m[1])) return m[1]
			const v = s.match(VK_TOKEN_RE)
			if (v) return v[0]
		}
		return ''
	}

	function dispatch(kind, data) {
		try { window.postMessage({ __bog_vk: kind, data }, '*') } catch (e) {}
	}

	function harvest_audios(json) {
		try {
			if (!json) return
			let items = []
			const r = json.response
			if (Array.isArray(r)) items = r
			else if (r && Array.isArray(r.items)) items = r.items
			else if (Array.isArray(json)) items = json
			const out = []
			for (const it of items) {
				if (!it || typeof it !== 'object') continue
				if (typeof it.id === 'number' && typeof it.owner_id === 'number') {
					out.push({
						id: it.id,
						owner_id: it.owner_id,
						artist: it.artist || '',
						title: it.title || '',
						duration: it.duration || 0,
						url: it.url || '',
						access_key: it.access_key || '',
					})
				}
			}
			if (out.length) dispatch('audios', out)
		} catch (e) {}
	}

	function method_from(url) {
		try {
			const m = String(url).match(/\/method\/([a-zA-Z]+\.[a-zA-Z]+)/)
			return m ? m[1] : ''
		} catch (e) { return '' }
	}

	// fetch
	try {
		const orig = window.fetch
		window.fetch = async function (input, init) {
			const url = typeof input === 'string' ? input : input && input.url
			let body = ''
			if (init && init.body) {
				if (init.body instanceof URLSearchParams) body = init.body.toString()
				else if (init.body instanceof FormData) {
					const parts = []
					for (const [k, v] of init.body.entries()) parts.push(k + '=' + v)
					body = parts.join('&')
				} else body = String(init.body)
			}
			const tok = find_token(url, body)
			if (tok) dispatch('token', tok)

			const resp = await orig.apply(this, arguments)
			try {
				if (url && url.indexOf('api.vk.com') >= 0 && AUDIO_METHODS.test(method_from(url))) {
					resp.clone().json().then(harvest_audios).catch(() => {})
				}
			} catch (e) {}
			return resp
		}
	} catch (e) {}

	// XMLHttpRequest
	try {
		const Xhr = window.XMLHttpRequest
		const open = Xhr.prototype.open
		const send = Xhr.prototype.send
		Xhr.prototype.open = function (m, url) { this.__bog_url = url; return open.apply(this, arguments) }
		Xhr.prototype.send = function (body) {
			try {
				const url = this.__bog_url || ''
				const tok = find_token(url, body)
				if (tok) dispatch('token', tok)
				if (url.indexOf('api.vk.com') >= 0 && AUDIO_METHODS.test(method_from(url))) {
					this.addEventListener('load', () => {
						try {
							const data = JSON.parse(this.responseText)
							harvest_audios(data)
						} catch (e) {}
					})
				}
			} catch (e) {}
			return send.apply(this, arguments)
		}
	} catch (e) {}

	dispatch('inject_ready', true)
})()
