namespace $ {

	/**
	 * Персональное хранилище треков пользователя в Giper Baza.
	 * Живёт в home land (персональные данные, синкаются между устройствами).
	 * Ключ — VK cache_key вида `${owner_id}_${id}`.
	 */
	export class $bog_vk_store extends $mol_object2 {

		/** Home land текущего пользователя. НЕ @$mol_mem — чтобы не было circular. */
		static land() {
			return this.$.$giper_baza_glob.home().land()
		}

		/** Словарь треков: cache_key → $bog_vk_track_baza. НЕ @$mol_mem. */
		static tracks_dict() {
			const Tracks = $giper_baza_dict_to($bog_vk_track_baza)
			return this.land().Data(Tracks)
		}

		/** Ключ для baza из VK-аудио. */
		static cache_key(audio: $bog_vk_api_audio): string {
			return `${audio.owner_id}_${audio.id}`
		}

		/**
		 * Собирает треки из baza. archived=false → активные, archived=true → архивные.
		 * Сортирует по Order (asc, с fallback на Added).
		 */
		@$mol_mem_key
		static list_audios(archived: boolean): $bog_vk_api_audio[] {
			const dict = this.tracks_dict()
			const keys = (dict.keys() ?? []) as string[]
			type Row = { audio: $bog_vk_api_audio, order: number, added: number }
			const rows: Row[] = []
			for (const key of keys) {
				const track = dict.key(key)
				if (!track) continue
				const is_arch = track.Archived()?.val() === true
				if (is_arch !== archived) continue
				const vk_id = track.Vk_id()?.val() ?? String(key)
				const parts = vk_id.split('_')
				const owner_id = Number(parts[0])
				const id = Number(parts[1])
				if (!Number.isFinite(owner_id) || !Number.isFinite(id)) continue
				const added = Number(track.Added()?.val() ?? 0)
				const order_val = track.Order()?.val()
				// Если Order не задан — fallback на Added (делим, чтобы был в том же порядке).
				const order = order_val == null ? added : Number(order_val)
				let url = track.Url()?.val() ?? ''
				rows.push({
					audio: {
						id,
						owner_id,
						artist: track.Artist()?.val() ?? '',
						title: track.Title()?.val() ?? '',
						duration: track.Duration()?.val() ?? 0,
						url,
					},
					order,
					added,
				})
			}
			rows.sort((a, b) => {
				if (a.order !== b.order) return a.order - b.order
				return b.added - a.added
			})
			return rows.map(r => r.audio)
		}

		/** Активные (не архивные) треки. */
		static saved_audios(): $bog_vk_api_audio[] {
			return this.list_audios(false)
		}

		/** Архивные треки. */
		static archived_audios(): $bog_vk_api_audio[] {
			return this.list_audios(true)
		}

		/** Максимальный Order среди всех треков (для добавления новых). */
		static max_order(): number {
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				return 0
			}
			const keys = (dict.keys() ?? []) as string[]
			let max = 0
			for (const key of keys) {
				const track = dict.key(key)
				if (!track) continue
				const o = Number(track.Order()?.val() ?? 0)
				if (o > max) max = o
				const a = Number(track.Added()?.val() ?? 0)
				if (a > max) max = a
			}
			return max
		}

		/** Сохраняет/обновляет трек в baza. Идемпотентно. */
		@$mol_action
		static save_track(audio: $bog_vk_api_audio): void {
			if (!audio) return
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				return
			}
			const key = this.cache_key(audio)
			const track = dict.key(key, 'auto')
			if (!track) return
			// Обновляем только если значения реально отличаются, чтобы не засорять CRDT.
			if (track.Vk_id()?.val() !== key) track.Vk_id('auto')!.val(key)
			const title = audio.title ?? ''
			if (track.Title()?.val() !== title) track.Title('auto')!.val(title)
			const artist = audio.artist ?? ''
			if (track.Artist()?.val() !== artist) track.Artist('auto')!.val(artist)
			const dur = Number(audio.duration ?? 0)
			if (track.Duration()?.val() !== dur) track.Duration('auto')!.val(dur)
			if (audio.url && track.Url()?.val() !== audio.url) track.Url('auto')!.val(audio.url)
			if (track.Added()?.val() == null) track.Added('auto')!.val(Date.now())
			// Назначаем Order для новых треков (max + 1), чтобы в списке шли последними.
			if (track.Order()?.val() == null) {
				track.Order('auto')!.val(this.max_order() + 1)
			}
			// Флаг Archived НЕ трогаем — снимается только явным restore_track.
		}

		/** Меняет Order двух треков местами. */
		@$mol_action
		static swap_order(a: $bog_vk_api_audio, b: $bog_vk_api_audio): void {
			if (!a || !b) return
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				return
			}
			const ta = dict.key(this.cache_key(a), 'auto')
			const tb = dict.key(this.cache_key(b), 'auto')
			if (!ta || !tb) return
			const oa_raw = ta.Order()?.val()
			const ob_raw = tb.Order()?.val()
			const aa = Number(ta.Added()?.val() ?? 0)
			const ab = Number(tb.Added()?.val() ?? 0)
			const oa = oa_raw == null ? aa : Number(oa_raw)
			const ob = ob_raw == null ? ab : Number(ob_raw)
			// Если значения равны — сдвигаем на 1, чтобы порядок действительно поменялся.
			const next_a = ob === oa ? oa + 1 : ob
			const next_b = ob === oa ? oa : oa
			ta.Order('auto')!.val(next_a)
			tb.Order('auto')!.val(next_b)
		}

		/** Помечает трек как удалённый (мягкое удаление). */
		@$mol_action
		static archive_track(audio: $bog_vk_api_audio): void {
			if (!audio) return
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				return
			}
			const key = this.cache_key(audio)
			const track = dict.key(key)
			if (!track) return
			track.Archived('auto')!.val(true)
		}

		/** RAM-кеш свежезагруженных файлов на текущей сессии — играем без ожидания синка baza. */
		private static fresh_files = new Map<string, File>()

		/** Достаёт blob локально загруженного трека. null если не локальный или нет файла. */
		static local_blob(audio: $bog_vk_api_audio): Blob | null {
			if (audio.owner_id !== 0) return null
			const key = this.cache_key(audio)
			const fresh = this.fresh_files.get(key)
			if (fresh) {
				console.log('[store] local blob from RAM:', audio.title, fresh.size, 'bytes,', fresh.type)
				return fresh
			}
			const dict = this.tracks_dict()
			const track = dict.key(key)
			if (!track) return null
			const file = track.File()?.remote()
			if (!file) return null
			const buf = file.buffer()
			if (!buf || buf.byteLength === 0) {
				console.warn('[store] local blob empty:', audio.title, 'type:', file.type())
				return null
			}
			const type = file.type() || 'audio/mpeg'
			const blob = new Blob([buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer], { type })
			console.log('[store] local blob from baza:', audio.title, blob.size, 'bytes,', type)
			return blob
		}

		/** Парсит "Artist - Title" из имени файла. */
		static parse_filename(name: string): { artist: string, title: string } {
			const base = name.replace(/\.[^.]+$/, '').trim()
			const m = base.match(/^(.+?)\s*[-–—]\s*(.+)$/)
			if (m) return { artist: m[1].trim(), title: m[2].trim() }
			return { artist: '', title: base }
		}

		/**
		 * Загружает локальный аудиофайл (с телефона) в home land.
		 * Блоб кладётся в $giper_baza_file, метаданные — в $bog_vk_track_baza.
		 * Возвращает audio для воспроизведения.
		 */
		/** Детерминированный hash по строке (FNV-1a 32 bit). */
		static hash_str(s: string): number {
			let h = 2166136261
			for (let i = 0; i < s.length; i++) {
				h ^= s.charCodeAt(i)
				h = Math.imul(h, 16777619)
			}
			return h >>> 0
		}

		@$mol_action
		static save_local_track(file: File, buffer: Uint8Array): $bog_vk_api_audio | null {
			const { artist, title } = this.parse_filename(file.name)
			// Детерминированный id — одинаковый при ретраях wire, не создаёт дубликаты.
			const id = this.hash_str(`${file.name}|${file.size}|${file.lastModified}`)
			const audio: $bog_vk_api_audio = {
				id,
				owner_id: 0,
				artist,
				title,
				duration: 0,
				url: '',
			}
			console.log('[store] save_local_track:', file.name, file.size, 'bytes, type:', file.type, 'key:', `0_${id}`)
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				console.warn('[store] tracks_dict failed:', e)
				return null
			}
			const key = this.cache_key(audio)
			const track = dict.key(key, 'auto')
			if (!track) {
				console.warn('[store] dict.key returned null for', key)
				return null
			}
			track.Vk_id('auto')!.val(key)
			track.Title('auto')!.val(title)
			track.Artist('auto')!.val(artist)
			if (track.Added()?.val() == null) track.Added('auto')!.val(Date.now())
			if (track.Order()?.val() == null) track.Order('auto')!.val(this.max_order() + 1)
			track.Archived('auto')!.val(false)
			const store = track.File('auto')!.ensure(null)
			if (store) {
				store.buffer(buffer as Uint8Array<ArrayBuffer>)
				store.type(file.type || 'audio/mpeg')
				if (file.name) store.name(file.name)
				console.log('[store] file written, type:', store.type(), 'chunks:', store.chunks().length)
			} else {
				console.warn('[store] File ensure returned null')
			}
			this.fresh_files.set(key, file)
			return audio
		}

		/** Окончательно удаляет трек из baza (по ключу). */
		@$mol_action
		static delete_track(audio: $bog_vk_api_audio): void {
			if (!audio) return
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				return
			}
			dict.cut(this.cache_key(audio))
		}

		/** Удаляет флаг Archived. */
		@$mol_action
		static restore_track(audio: $bog_vk_api_audio): void {
			if (!audio) return
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				return
			}
			const key = this.cache_key(audio)
			const track = dict.key(key)
			if (!track) return
			track.Archived('auto')!.val(false)
		}

	}

}
