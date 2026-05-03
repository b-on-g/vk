// Content script for vk.com.
// 1. Sniffs access_token from XHR/fetch on api.vk.com → chrome.storage.local.vk_token.
// 2. Captures every audio object that flies through audio.get / audio.search / audio.getById /
//    audio.getRecommendations / audio.getPopular and stores them by `${owner_id}_${id}` in window.__bog_vk_audios.
// 3. Injects a "Download" button into the VK audio player rows; click → fetches the HLS playlist,
//    decrypts/concatenates segments and triggers a Blob download (raw AAC/M4A — playable in modern browsers
//    and music libraries).

(function () {
	'use strict'

	// --- 1) Page-world hooks: forward token + audios via postMessage --------------------------

	const PAGE_PATCH = function () {
		const TOKEN_RE = /access_token=([^&\s'"]+)/
		const VK_TOKEN_RE = /vk1\.a\.[A-Za-z0-9_-]+/

		function find_token(...sources) {
			for (const src of sources) {
				const s = String(src || '')
				const m = s.match(TOKEN_RE)
				if (m && /^vk1\.a\./.test(m[1])) return m[1]
				const v = s.match(VK_TOKEN_RE)
				if (v) return v[0]
			}
			return ''
		}

		function dispatch(kind, data) {
			window.postMessage({ __bog_vk: kind, data }, '*')
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
					if (typeof it.id === 'number' && typeof it.owner_id === 'number' && typeof it.url === 'string') {
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

		const AUDIO_METHODS = /^audio\.(get|search|getById|getRecommendations|getPopular|getPlaylist)$/

		// fetch
		try {
			const orig = window.fetch
			window.fetch = async function (input, init) {
				const url = typeof input === 'string' ? input : input?.url
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

		// XHR
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
	}

	try {
		const tag = document.createElement('script')
		tag.textContent = '(' + PAGE_PATCH.toString() + ')()'
		;(document.head || document.documentElement).appendChild(tag)
		tag.remove()
	} catch (e) {
		console.warn('[bog_vk_ext] inject failed', e)
	}

	// --- 2) Isolated-world: keep token + audios cache ---------------------------------------

	const audios_cache = new Map() // key: `${owner_id}_${id}` → audio

	function audio_key(audio) { return audio.owner_id + '_' + audio.id }

	window.addEventListener('message', (e) => {
		if (e.source !== window) return
		const msg = e.data
		if (!msg || typeof msg.__bog_vk !== 'string') return

		if (msg.__bog_vk === 'token') {
			const token = msg.token || msg.data
			if (!token) return
			try {
				chrome.storage.local.get(['vk_token'], (cur) => {
					if (cur && cur.vk_token === token) return
					chrome.storage.local.set({ vk_token: token })
					console.info('[bog_vk_ext] token captured from vk.com')
				})
			} catch (e) {}
		}

		if (msg.__bog_vk === 'audios' && Array.isArray(msg.data)) {
			for (const a of msg.data) audios_cache.set(audio_key(a), a)
		}
	})

	// --- 3) HLS download: fetch m3u8, decrypt segments, concat raw bytes, save as Blob ------

	async function fetch_buf(url) {
		const r = await fetch(url, { credentials: 'omit' })
		if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url)
		return r.arrayBuffer()
	}

	function parse_m3u8(text, base) {
		const lines = text.split('\n')
		let key_url = '', key_iv = ''
		const segments = []
		for (const raw of lines) {
			const l = raw.trim()
			if (l.startsWith('#EXT-X-KEY:')) {
				const u = l.match(/URI="([^"]+)"/)
				if (u) key_url = u[1].startsWith('http') ? u[1] : base + u[1]
				const iv = l.match(/IV=0x([0-9a-fA-F]+)/)
				if (iv) key_iv = iv[1]
			} else if (l && !l.startsWith('#')) {
				segments.push(l.startsWith('http') ? l : base + l)
			}
		}
		return { segments, key_url, key_iv }
	}

	async function decrypt(buf, cryptoKey, idx, iv_hex) {
		let iv
		if (iv_hex) {
			const bytes = new Uint8Array(16)
			for (let i = 0; i < 16 && i * 2 < iv_hex.length; i++) bytes[i] = parseInt(iv_hex.substr(i * 2, 2), 16)
			iv = bytes.buffer
		} else {
			const b = new Uint8Array(16)
			b[15] = idx & 0xff; b[14] = (idx >> 8) & 0xff; b[13] = (idx >> 16) & 0xff; b[12] = (idx >> 24) & 0xff
			iv = b.buffer
		}
		return crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, buf)
	}

	// Strip MPEG-TS framing and PES headers, extract raw ADTS/AAC.
	function demux_ts(ts) {
		const groups = new Map()
		for (let pos = 0; pos + 188 <= ts.length; pos += 188) {
			if (ts[pos] !== 0x47) continue
			const pusi = !!(ts[pos + 1] & 0x40)
			const pid = ((ts[pos + 1] & 0x1f) << 8) | ts[pos + 2]
			const afc = (ts[pos + 3] >> 4) & 0x03
			if (pid === 0 || pid === 0x1fff) continue
			if (!(afc & 0x01)) continue
			let off = 4
			if (afc & 0x02) off += 1 + ts[pos + 4]
			if (off >= 188) continue
			if (!groups.has(pid)) groups.set(pid, [])
			groups.get(pid).push({ pusi, data: ts.slice(pos + off, pos + 188) })
		}
		for (const [pid, chunks] of groups) {
			const first = chunks.find(c => c.pusi)
			if (!first) continue
			const d = first.data
			if (d.length < 9 || d[0] !== 0x00 || d[1] !== 0x00 || d[2] !== 0x01) continue
			if (d[3] < 0xc0 || d[3] > 0xdf) continue
			const parts = []
			for (const c of chunks) {
				if (c.pusi) {
					const p = c.data
					if (p.length < 9 || p[0] !== 0x00 || p[1] !== 0x00 || p[2] !== 0x01) continue
					const hdrLen = 9 + p[8]
					if (hdrLen < p.length) parts.push(p.slice(hdrLen))
				} else parts.push(c.data)
			}
			const total = parts.reduce((s, p) => s + p.length, 0)
			if (!total) continue
			const out = new Uint8Array(total); let o = 0
			for (const p of parts) { out.set(p, o); o += p.length }
			return out
		}
		return null
	}

	function detect_format(bytes) {
		if (bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0) return { mime: 'audio/aac', ext: 'aac' }
		if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return { mime: 'audio/mpeg', ext: 'mp3' }
		if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return { mime: 'audio/mpeg', ext: 'mp3' }
		return { mime: 'audio/aac', ext: 'aac' }
	}

	async function download_audio(audio, btn) {
		const set_state = (cls, label) => {
			if (!btn) return
			btn.dataset.state = cls
			if (label) btn.textContent = label
		}
		try {
			let url = audio.url
			if (!url) throw new Error('No URL')
			set_state('loading', '⏳')

			const m3u8_resp = await fetch(url)
			if (!m3u8_resp.ok) throw new Error('m3u8 ' + m3u8_resp.status)
			const text = await m3u8_resp.text()
			const base = url.substring(0, url.lastIndexOf('/') + 1)
			const { segments, key_url, key_iv } = parse_m3u8(text, base)
			if (!segments.length) throw new Error('No segments')

			let cryptoKey = null
			if (key_url) {
				const k = await fetch_buf(key_url)
				cryptoKey = await crypto.subtle.importKey('raw', k, 'AES-CBC', false, ['decrypt'])
			}

			const chunks = []
			for (let i = 0; i < segments.length; i++) {
				let buf = await fetch_buf(segments[i])
				const first = new Uint8Array(buf)[0]
				if (cryptoKey && first !== 0x47) buf = await decrypt(buf, cryptoKey, i, key_iv)
				chunks.push(buf)
				set_state('loading', '⏳ ' + (i + 1) + '/' + segments.length)
			}

			const total = chunks.reduce((s, c) => s + c.byteLength, 0)
			const merged = new Uint8Array(total)
			let off = 0
			for (const c of chunks) { merged.set(new Uint8Array(c), off); off += c.byteLength }

			let raw = merged
			let { mime, ext } = detect_format(merged)
			if (merged[0] === 0x47) {
				const audio_bytes = demux_ts(merged)
				if (audio_bytes) { raw = audio_bytes; mime = 'audio/aac'; ext = 'aac' }
			}

			const safe = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
			const filename = (safe(audio.artist) + ' - ' + safe(audio.title) + '.' + ext).replace(/^ - /, '')
			const blob = new Blob([raw], { type: mime })
			const a = document.createElement('a')
			a.href = URL.createObjectURL(blob)
			a.download = filename
			document.body.appendChild(a)
			a.click()
			a.remove()
			setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
			set_state('done', '✓')
			setTimeout(() => set_state('', '⬇'), 2000)
		} catch (e) {
			console.warn('[bog_vk_ext] download failed', e)
			set_state('error', '⚠')
			setTimeout(() => set_state('', '⬇'), 2500)
		}
	}

	// --- 4) UI injection: place a Download button on every audio row ------------------------

	const STYLE = `
		.bog-vk-dl {
			display: inline-flex; align-items: center; justify-content: center;
			width: 28px; height: 28px; padding: 0; margin: 0 4px;
			background: transparent; border: 0; border-radius: 50%; cursor: pointer;
			color: inherit; opacity: 0.6; font: 14px/1 system-ui, sans-serif;
			transition: opacity .15s, background .15s;
		}
		.bog-vk-dl:hover { opacity: 1; background: rgba(0,0,0,.08); }
		.bog-vk-dl[data-state="loading"] { opacity: 1; color: #4680c2; }
		.bog-vk-dl[data-state="done"]    { opacity: 1; color: #2db849; }
		.bog-vk-dl[data-state="error"]   { opacity: 1; color: #d33; }
	`

	function inject_style() {
		if (document.getElementById('bog-vk-dl-style')) return
		const s = document.createElement('style')
		s.id = 'bog-vk-dl-style'
		s.textContent = STYLE
		document.head.appendChild(s)
	}

	// VK markup is opaque (hashed CSS module classes). We look for elements that have a
	// `data-audio` attribute or whose data-* properties contain owner_id/id we already saw.
	function key_from_node(node) {
		const da = node.getAttribute && node.getAttribute('data-audio')
		if (da) {
			// data-audio looks like "<owner>_<id>_..." or JSON.
			const m = da.match(/(-?\d+)_(\d+)/)
			if (m) return m[1] + '_' + m[2]
		}
		// Fallback: scan dataset.
		try {
			for (const k in node.dataset) {
				const v = node.dataset[k]
				if (typeof v !== 'string') continue
				const m = v.match(/(-?\d+)_(\d+)/)
				if (m && audios_cache.has(m[1] + '_' + m[2])) return m[1] + '_' + m[2]
			}
		} catch (e) {}
		return ''
	}

	function add_button_to(row) {
		if (!row || row.querySelector('.bog-vk-dl')) return
		const key = key_from_node(row)
		if (!key) return
		const audio = audios_cache.get(key)
		if (!audio || !audio.url) return

		const btn = document.createElement('button')
		btn.className = 'bog-vk-dl'
		btn.title = 'Скачать (Bog VK)'
		btn.textContent = '⬇'
		btn.addEventListener('click', (e) => {
			e.preventDefault(); e.stopPropagation()
			download_audio(audio, btn)
		})
		row.appendChild(btn)
	}

	function scan() {
		// Common VK selectors that wrap a single audio row across desktop / mobile / new player.
		const candidates = document.querySelectorAll(
			'[data-audio], [class*="audio_row"], [class*="AudioRow"], [class*="audio-item"]'
		)
		candidates.forEach(add_button_to)
	}

	function start_observer() {
		inject_style()
		scan()
		const mo = new MutationObserver(() => { scan() })
		mo.observe(document.documentElement, { childList: true, subtree: true })
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start_observer, { once: true })
	} else {
		start_observer()
	}
})()
