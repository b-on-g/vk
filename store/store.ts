namespace $ {

	/**
	 * Персональное хранилище треков пользователя в Giper Baza.
	 * Живёт в home land (персональные данные, синкаются между устройствами).
	 * Ключ — VK cache_key вида `${owner_id}_${id}`.
	 */
	export class $bog_vk_store extends $mol_object2 {

		/** Версия для инвалидации — инкрементируй после записи, чтобы читатели перечитали. */
		@$mol_mem
		static version(next?: number): number {
			return next ?? 0
		}

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
			this.version()
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				return []
			}
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
				// Локально загруженные треки хранят blob в File — резолвим в baza-uri.
				let url = track.Url()?.val() ?? ''
				try {
					const file = track.File()?.remote()
					if (file) url = file.uri()
				} catch (e) {
					if (e instanceof Promise) throw e
				}
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
			// Снимаем флаг Archived при повторном добавлении.
			if (track.Archived()?.val() === true) track.Archived('auto')!.val(false)
			this.version(this.version() + 1)
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
			this.version(this.version() + 1)
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
			this.version(this.version() + 1)
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
		@$mol_action
		static save_local_track(file: File): $bog_vk_api_audio | null {
			const { artist, title } = this.parse_filename(file.name)
			const audio: $bog_vk_api_audio = {
				id: Date.now() + Math.floor(Math.random() * 1000),
				owner_id: 0,
				artist,
				title,
				duration: 0,
				url: '',
			}
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				return null
			}
			const key = this.cache_key(audio)
			const track = dict.key(key, 'auto')
			if (!track) return null
			track.Vk_id('auto')!.val(key)
			track.Title('auto')!.val(title)
			track.Artist('auto')!.val(artist)
			track.Added('auto')!.val(Date.now())
			track.Order('auto')!.val(this.max_order() + 1)
			track.Archived('auto')!.val(false)
			const store = track.File('auto')!.ensure(null)
			if (store) {
				store.blob(file)
				track.File('auto')!.remote(store)
			}
			this.version(this.version() + 1)
			return audio
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
			this.version(this.version() + 1)
		}

	}

}
