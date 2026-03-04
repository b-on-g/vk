namespace $ {

	type $bog_vk_cache_schema = {
		tracks: {
			Key: string
			Doc: Blob
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

		static async has(audio: $bog_vk_api_audio): Promise<boolean> {
			try {
				const db = await this.db_async()
				const count = await db.read('tracks').tracks.count(this.cache_key(audio))
				db.destructor()
				return count > 0
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

				const db = await this.db_async()
				const tx = db.change('tracks')
				await tx.stores.tracks.put(blob, this.cache_key(audio))
				db.destructor()

				console.log('[cache] saved:', audio.title, `(${(total / 1024 / 1024).toFixed(1)} MB)`)
			} catch (e) {
				console.warn('[cache] failed to save:', audio.title, e)
			}
		}
	}
}
