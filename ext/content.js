// Content script for vk.com — sniffs access_token and cookies from live VK XHR/fetch traffic
// and stores them in chrome.storage.local so the popup picks them up automatically.
//
// Runs in the isolated world but injects a page-world patch for fetch/XHR
// (page scripts use original window.fetch which is invisible from isolated world).

(function () {
	'use strict'

	const PAGE_PATCH = function () {
		const TOKEN_RE = /access_token=([^&\s'"]+)/
		const VK_TOKEN_RE = /vk1\.a\.[A-Za-z0-9_-]+/

		function extract(url, body) {
			const sources = [url || '', String(body || '')]
			for (const src of sources) {
				const m = src.match(TOKEN_RE)
				if (m && /^vk1\.a\./.test(m[1])) return m[1]
				const v = src.match(VK_TOKEN_RE)
				if (v) return v[0]
			}
			return ''
		}

		function notify(token) {
			if (!token) return
			window.postMessage({ __bog_vk: 'token', token }, '*')
		}

		try {
			const origFetch = window.fetch
			window.fetch = function (input, init) {
				try {
					const url = typeof input === 'string' ? input : input?.url
					if (url && url.indexOf('api.vk.com') >= 0) {
						let body = init && init.body ? init.body : ''
						if (body instanceof URLSearchParams) body = body.toString()
						else if (body instanceof FormData) {
							const parts = []
							for (const [k, v] of body.entries()) parts.push(k + '=' + v)
							body = parts.join('&')
						}
						const tok = extract(url, body)
						if (tok) notify(tok)
					}
				} catch (e) {}
				return origFetch.apply(this, arguments)
			}
		} catch (e) {}

		try {
			const OrigXHR = window.XMLHttpRequest
			const open = OrigXHR.prototype.open
			const send = OrigXHR.prototype.send
			OrigXHR.prototype.open = function (method, url) {
				this.__bog_vk_url = url
				return open.apply(this, arguments)
			}
			OrigXHR.prototype.send = function (body) {
				try {
					const url = this.__bog_vk_url || ''
					if (url.indexOf('api.vk.com') >= 0) {
						const tok = extract(url, body)
						if (tok) notify(tok)
					}
				} catch (e) {}
				return send.apply(this, arguments)
			}
		} catch (e) {}
	}

	// Inject the patch into page world. Content script can't replace window.fetch
	// of the page itself (isolated worlds), so we drop a <script> tag with the patch.
	try {
		const tag = document.createElement('script')
		tag.textContent = '(' + PAGE_PATCH.toString() + ')()'
		;(document.head || document.documentElement).appendChild(tag)
		tag.remove()
	} catch (e) {
		console.warn('[bog_vk_ext] inject failed', e)
	}

	// Bridge page world → extension storage.
	window.addEventListener('message', (e) => {
		if (e.source !== window) return
		const data = e.data
		if (!data || data.__bog_vk !== 'token') return
		const token = data.token
		if (!token) return
		try {
			chrome.storage.local.get(['vk_token'], (cur) => {
				if (cur && cur.vk_token === token) return
				chrome.storage.local.set({ vk_token: token })
				console.info('[bog_vk_ext] token captured from vk.com')
			})
		} catch (e) {}
	})
})()
