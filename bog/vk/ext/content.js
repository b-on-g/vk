// Content script for vk.com.
// 1. Sniffs access_token from XHR/fetch on api.vk.com → chrome.storage.local.vk_token.
// 2. Captures audio objects flying through audio.get* methods into window cache.
// 3. Injects a "Save" button on every VK audio row; click → sendMessage to background
//    с маленьким {audio_meta}. Background сам качает HLS, демуксит, пишет в IDB.
//    Так бинарь (~8MB) не путешествует через chrome.runtime.sendMessage и SW
//    не падает с «context invalidated».

(function () {
	'use strict'

	console.info('[bog_vk_ext] content_script loaded on', location.host)

	// --- 1) Inject page-world patch via <script src="chrome-extension://...">.

	try {
		const tag = document.createElement('script')
		tag.src = chrome.runtime.getURL('bog/vk/ext/inject.js')
		tag.onload = () => tag.remove()
		;(document.head || document.documentElement).appendChild(tag)
	} catch (e) {
		console.warn('[bog_vk_ext] inject failed', e)
	}

	// --- 2) Isolated-world: keep token + audios cache --------------------------

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

	// --- 3) Trigger save via background ----------------------------------------

	function is_context_dead_error(e) {
		const msg = String((e && e.message) || e || '')
		return msg.includes('Extension context invalidated')
	}

	// Через port, а не sendMessage. reply-канал sendMessage'а имеет таймаут
	// (anecdotal ~30s — 5min) → длинный fetch HLS-сегментов рвёт его, sender
	// видит «channel closed». chrome.runtime.connect держит SW живым пока
	// порт open.
	function save_to_extension(audio) {
		return new Promise((resolve, reject) => {
			let port
			try {
				port = chrome.runtime.connect({ name: 'bog_vk_download' })
			} catch (e) {
				reject(e)
				return
			}
			let done = false
			port.onMessage.addListener((msg) => {
				if (msg?.type === 'done') {
					done = true
					try { port.disconnect() } catch {}
					resolve()
				} else if (msg?.type === 'error') {
					done = true
					try { port.disconnect() } catch {}
					reject(new Error(msg.error || 'save failed'))
				}
			})
			port.onDisconnect.addListener(() => {
				if (done) return
				const err = chrome.runtime.lastError
				reject(new Error((err && err.message) || 'port disconnected'))
			})
			try {
				port.postMessage({
					type: 'download_track',
					audio: {
						id: audio.id,
						owner_id: audio.owner_id,
						title: audio.title || '',
						artist: audio.artist || '',
						duration: audio.duration || 0,
						url: audio.url || '',
						access_key: audio.access_key || '',
					},
				})
			} catch (e) {
				reject(e)
			}
		})
	}

	async function download_audio(audio, btn) {
		const set_state = (cls, label) => {
			if (!btn) return
			btn.dataset.state = cls
			if (label) btn.textContent = label
		}
		try {
			set_state('loading', '⏳')
			await save_to_extension(audio)
			set_state('done', '✓')
			setTimeout(() => set_state('', '⬇'), 2000)
		} catch (e) {
			console.warn('[bog_vk_ext] save failed', e)
			set_state('error', '⚠')
			const text = is_context_dead_error(e)
				? 'Расширение / SW упал. Открой extension popup и нажми ⟳, потом F5 на vk.com'
				: String((e && e.message) || e)
			if (btn) btn.title = text
			setTimeout(() => {
				set_state('', '⬇')
				if (btn) btn.title = 'Сохранить в Bog VK'
			}, 5000)
		}
	}

	// --- 4) UI injection: place a Save button on every audio row ----------------

	const STYLE = `
		.bog-vk-dl {
			display: inline-flex; align-items: center; justify-content: center;
			flex: 0 0 auto;
			width: 24px; height: 24px; padding: 0; margin: 0 6px;
			background: transparent; border: 0; border-radius: 50%; cursor: pointer;
			color: var(--vkui--color_icon_secondary, #6e7783);
			font: 13px/1 system-ui, sans-serif;
			vertical-align: middle;
			transition: color .15s, background .15s, transform .15s;
		}
		.bog-vk-dl:hover { color: var(--vkui--color_icon_accent_themed, #4986cc); background: rgba(0, 16, 61, 0.06); }
		.bog-vk-dl:active { transform: scale(0.92); }
		.bog-vk-dl[data-state="loading"] { color: #4986cc; cursor: progress; }
		.bog-vk-dl[data-state="done"]    { color: #2db849; }
		.bog-vk-dl[data-state="error"]   { color: #d33; }
	`

	function inject_style() {
		if (document.getElementById('bog-vk-dl-style')) return
		const s = document.createElement('style')
		s.id = 'bog-vk-dl-style'
		s.textContent = STYLE
		document.head.appendChild(s)
	}

	// VK ships row metadata as a JSON array in `data-audio`:
	//   [id, owner_id, url, title, artist, duration, ..., access_key, ...]
	function parse_row(node) {
		try {
			const raw = node.getAttribute && node.getAttribute('data-audio')
			if (!raw) return null
			const arr = JSON.parse(raw)
			if (!Array.isArray(arr) || arr.length < 6) return null
			const audio = {
				id: Number(arr[0]),
				owner_id: Number(arr[1]),
				url: typeof arr[2] === 'string' ? arr[2] : '',
				title: typeof arr[3] === 'string' ? arr[3] : '',
				artist: typeof arr[4] === 'string' ? arr[4] : '',
				duration: Number(arr[5]) || 0,
				access_key: '',
			}
			for (const v of arr) {
				if (typeof v !== 'string' || v.length < 50) continue
				if (!/^[A-Za-z0-9_-]+$/.test(v)) continue
				audio.access_key = v
				break
			}
			if (!Number.isFinite(audio.id) || !Number.isFinite(audio.owner_id)) return null
			return audio
		} catch (e) { return null }
	}

	function add_button_to(row) {
		if (!row || row.querySelector('.bog-vk-dl')) return
		let audio = parse_row(row)
		if (!audio) {
			const fid = row.getAttribute && row.getAttribute('data-full-id')
			if (fid) {
				const m = fid.match(/^(-?\d+)_(\d+)$/)
				if (m) {
					const cached = audios_cache.get(fid)
					audio = cached || { id: +m[2], owner_id: +m[1], title: '', artist: '', duration: 0, url: '', access_key: '' }
				}
			}
		}
		if (!audio) return

		const btn = document.createElement('button')
		btn.className = 'bog-vk-dl'
		btn.title = 'Сохранить в Bog VK'
		btn.textContent = '⬇'
		btn.addEventListener('click', (e) => {
			e.preventDefault(); e.stopPropagation()
			download_audio(audio, btn)
		})

		const duration = row.querySelector('[class*="audio_row__duration"], [class*="audioRow__duration"], [class*="audio_row__info"], [class*="audioRow__info"]')
		if (duration && duration.parentElement) {
			duration.parentElement.insertBefore(btn, duration.nextSibling)
		} else {
			row.appendChild(btn)
		}
	}

	function scan() {
		const rows = document.querySelectorAll('[data-audio]')
		rows.forEach(add_button_to)
		document.querySelectorAll('[data-full-id][class*="audio_row"], [data-full-id][class*="AudioRow"]').forEach(add_button_to)
		if (rows.length && !window.__bog_vk_scan_logged) {
			console.info('[bog_vk_ext] found', rows.length, 'audio rows on', location.host)
			window.__bog_vk_scan_logged = true
		}
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
