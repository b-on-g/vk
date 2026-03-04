namespace $ {

	type $bog_vk_cache_schema = {
		tracks: {
			Key: string
			Doc: Blob
			Indexes: {}
		}
		meta: {
			Key: string
			Doc: $bog_vk_api_audio
			Indexes: {}
		}
	}

	export class $bog_vk_cache extends $mol_object {

		static db() {
			return $mol_wire_sync(this).db_async()
		}

		static async db_async() {
			return $$.$mol_db<$bog_vk_cache_schema>(
				'vk_audio_cache',
				mig => mig.store_make('tracks'),
				mig => mig.store_make('meta'),
			)
		}

		static cache_key(audio: $bog_vk_api_audio) {
			return `${audio.owner_id}_${audio.id}`
		}

		static async get(audio: $bog_vk_api_audio): Promise<string | null> {
			const key = this.cache_key(audio)
			try {
				const db = await this.db_async()
				const blob = await db.read('tracks').tracks.get(key)
				db.destructor()
				if (blob) {
					console.log(`[cache] hit: ${audio.artist} — ${audio.title} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`)
					return URL.createObjectURL(blob)
				}
				console.warn(`[cache] miss: ${audio.artist} — ${audio.title} (key: ${key})`)
				return null
			} catch (e: any) {
				console.warn(`[cache] get error: ${key}`, e?.message)
				return null
			}
		}

		static async all_cached(): Promise<$bog_vk_api_audio[]> {
			try {
				const db = await this.db_async()
				const all = await db.read('meta').meta.select()
				db.destructor()
				return all
			} catch {
				return []
			}
		}

		static extract_audio(ts: Uint8Array): { data: Uint8Array, mime: string } {
			// Already raw AAC (ADTS)
			if (ts[0] === 0xFF && (ts[1] & 0xF0) === 0xF0) {
				return { data: ts, mime: 'audio/aac' }
			}

			// Already MP3
			if (ts[0] === 0xFF && (ts[1] & 0xE0) === 0xE0) {
				return { data: ts, mime: 'audio/mpeg' }
			}

			// ID3 tag (MP3 with metadata)
			if (ts[0] === 0x49 && ts[1] === 0x44 && ts[2] === 0x33) {
				return { data: ts, mime: 'audio/mpeg' }
			}

			// MPEG-TS → extract ADTS AAC frames
			if (ts[0] === 0x47) {
				const frames: Uint8Array[] = []

				for (let i = 0; i < ts.length - 7; i++) {
					// ADTS sync word: 0xFFF (12 bits)
					if (ts[i] !== 0xFF || (ts[i + 1] & 0xF6) !== 0xF0) continue

					// Frame length from ADTS header (13 bits at offset 30-42)
					const len = ((ts[i + 3] & 0x03) << 11) |
						(ts[i + 4] << 3) |
						((ts[i + 5] & 0xE0) >> 5)

					if (len < 7 || len > 8192 || i + len > ts.length) continue

					frames.push(ts.slice(i, i + len))
					i += len - 1
				}

				if (frames.length > 0) {
					const size = frames.reduce((s, f) => s + f.length, 0)
					const out = new Uint8Array(size)
					let off = 0
					for (const f of frames) {
						out.set(f, off)
						off += f.length
					}
					return { data: out, mime: 'audio/aac' }
				}
			}

			// Fallback: return as-is
			return { data: ts, mime: 'audio/mpeg' }
		}

		static async save_hls(audio: $bog_vk_api_audio): Promise<void> {
			const url = audio.url
			if (!url) {
				console.warn('[cache] skip — no URL:', audio.artist, '—', audio.title)
				return
			}

			const key = this.cache_key(audio)

			try {
				const db_check = await this.db_async()
				const existing = await db_check.read('tracks').tracks.count(key)
				db_check.destructor()
				if (existing > 0) {
					console.log('[cache] already cached:', audio.artist, '—', audio.title)
					return
				}

				console.log('[cache] start download:', audio.artist, '—', audio.title)

				const m3u8_resp = await fetch(url)
				if (!m3u8_resp.ok) throw new Error(`m3u8 fetch ${m3u8_resp.status}`)
				const m3u8_text = await m3u8_resp.text()

				const base_url = url.substring(0, url.lastIndexOf('/') + 1)
				const segments = m3u8_text
					.split('\n')
					.filter(line => line.trim() && !line.startsWith('#'))
					.map(seg => seg.startsWith('http') ? seg : base_url + seg)

				if (!segments.length) throw new Error('No segments in m3u8')

				console.log(`[cache] ${segments.length} segments to download`)

				const chunks: ArrayBuffer[] = []
				for (let i = 0; i < segments.length; i++) {
					const resp = await fetch(segments[i])
					if (!resp.ok) throw new Error(`Segment ${i + 1}/${segments.length} failed: ${resp.status}`)
					chunks.push(await resp.arrayBuffer())
				}

				const total = chunks.reduce((s, c) => s + c.byteLength, 0)
				const merged = new Uint8Array(total)
				let offset = 0
				for (const chunk of chunks) {
					merged.set(new Uint8Array(chunk), offset)
					offset += chunk.byteLength
				}

				const { data: audioData, mime } = this.extract_audio(merged)
				const blob = new Blob([audioData.buffer as ArrayBuffer], { type: mime })
				const sizeMB = (audioData.byteLength / 1024 / 1024).toFixed(1)
				console.log(`[cache] format: ${mime}, extracted ${sizeMB} MB from ${(total / 1024 / 1024).toFixed(1)} MB TS`)

				const db = await this.db_async()
				const tx = db.change('tracks', 'meta')
				await tx.stores.tracks.put(blob, key)
				await tx.stores.meta.put({ ...audio, url: '' }, key)
				db.destructor()

				console.log(`[cache] saved: ${audio.artist} — ${audio.title} (${sizeMB} MB)`)
			} catch (e: any) {
				console.warn(`[cache] FAILED: ${audio.artist} — ${audio.title}:`, e?.message ?? e)
			}
		}
	}
}
