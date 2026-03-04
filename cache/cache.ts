namespace $ {

	const DB_NAME = 'vk_audio_cache'
	const DB_VERSION = 1
	const STORE_NAME = 'tracks'

	function open_db(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, DB_VERSION)
			req.onupgradeneeded = () => {
				const db = req.result
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME)
				}
			}
			req.onsuccess = () => resolve(req.result)
			req.onerror = () => reject(req.error)
		})
	}

	function cache_key(audio: $bog_vk_api_audio) {
		return `${audio.owner_id}_${audio.id}`
	}

	export class $bog_vk_cache extends $mol_object {

		static async get(audio: $bog_vk_api_audio): Promise<string | null> {
			try {
				const db = await open_db()
				return new Promise((resolve, reject) => {
					const tx = db.transaction(STORE_NAME, 'readonly')
					const store = tx.objectStore(STORE_NAME)
					const req = store.get(cache_key(audio))
					req.onsuccess = () => {
						const blob = req.result as Blob | undefined
						if (blob) {
							resolve(URL.createObjectURL(blob))
						} else {
							resolve(null)
						}
					}
					req.onerror = () => resolve(null)
				})
			} catch {
				return null
			}
		}

		static async has(audio: $bog_vk_api_audio): Promise<boolean> {
			try {
				const db = await open_db()
				return new Promise((resolve) => {
					const tx = db.transaction(STORE_NAME, 'readonly')
					const store = tx.objectStore(STORE_NAME)
					const req = store.count(cache_key(audio))
					req.onsuccess = () => resolve(req.result > 0)
					req.onerror = () => resolve(false)
				})
			} catch {
				return false
			}
		}

		static async save_hls(audio: $bog_vk_api_audio): Promise<void> {
			const url = audio.url
			if (!url) return

			try {
				console.log('[cache] downloading HLS:', audio.title)

				const m3u8_resp = await fetch(url)
				if (!m3u8_resp.ok) throw new Error('Failed to fetch m3u8')
				const m3u8_text = await m3u8_resp.text()

				const base_url = url.substring(0, url.lastIndexOf('/') + 1)
				const segments = m3u8_text
					.split('\n')
					.filter(line => line.trim() && !line.startsWith('#'))
					.map(seg => seg.startsWith('http') ? seg : base_url + seg)

				if (!segments.length) throw new Error('No segments found')

				const chunks: ArrayBuffer[] = []
				for (const seg_url of segments) {
					const resp = await fetch(seg_url)
					if (!resp.ok) throw new Error(`Segment fetch failed: ${seg_url}`)
					chunks.push(await resp.arrayBuffer())
				}

				const total = chunks.reduce((s, c) => s + c.byteLength, 0)
				const merged = new Uint8Array(total)
				let offset = 0
				for (const chunk of chunks) {
					merged.set(new Uint8Array(chunk), offset)
					offset += chunk.byteLength
				}

				const blob = new Blob([merged], { type: 'audio/mpeg' })

				const db = await open_db()
				await new Promise<void>((resolve, reject) => {
					const tx = db.transaction(STORE_NAME, 'readwrite')
					const store = tx.objectStore(STORE_NAME)
					const req = store.put(blob, cache_key(audio))
					req.onsuccess = () => resolve()
					req.onerror = () => reject(req.error)
				})

				console.log('[cache] saved:', audio.title, `(${(total / 1024 / 1024).toFixed(1)} MB)`)
			} catch (e) {
				console.warn('[cache] failed to save:', audio.title, e)
			}
		}
	}
}
