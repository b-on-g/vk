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
			try {
				const db = await this.db_async()
				const blob = await db.read('tracks').tracks.get(this.cache_key(audio))
				db.destructor()
				if (blob) return URL.createObjectURL(blob)
				return null
			} catch {
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

				const blob = new Blob([merged], { type: 'audio/mpeg' })
				const sizeMB = (total / 1024 / 1024).toFixed(1)

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
