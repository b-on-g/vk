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
		 * Читает список сохранённых треков как $bog_vk_api_audio[].
		 * Можно безопасно ставить @$mol_mem — возвращает массив примитивов.
		 */
		@$mol_mem
		static saved_audios(): $bog_vk_api_audio[] {
			this.version()
			let dict: ReturnType<typeof $bog_vk_store.tracks_dict>
			try {
				dict = this.tracks_dict()
			} catch (e) {
				if (e instanceof Promise) throw e
				return []
			}
			const keys = (dict.keys() ?? []) as string[]
			const out: $bog_vk_api_audio[] = []
			for (const key of keys) {
				const track = dict.key(key)
				if (!track) continue
				if (track.Archived()?.val() === true) continue
				const vk_id = track.Vk_id()?.val() ?? String(key)
				const parts = vk_id.split('_')
				const owner_id = Number(parts[0])
				const id = Number(parts[1])
				if (!Number.isFinite(owner_id) || !Number.isFinite(id)) continue
				out.push({
					id,
					owner_id,
					artist: track.Artist()?.val() ?? '',
					title: track.Title()?.val() ?? '',
					duration: track.Duration()?.val() ?? 0,
					url: track.Url()?.val() ?? '',
				})
			}
			// Сортируем по Order (asc), потом по Added (desc).
			out.sort((a, b) => {
				const ka = this.cache_key(a)
				const kb = this.cache_key(b)
				const ta = dict.key(ka)
				const tb = dict.key(kb)
				const oa = ta?.Order()?.val() ?? 0
				const ob = tb?.Order()?.val() ?? 0
				if (oa !== ob) return oa - ob
				const aa = ta?.Added()?.val() ?? 0
				const ab = tb?.Added()?.val() ?? 0
				return ab - aa
			})
			return out
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
			// Снимаем флаг Archived при повторном добавлении.
			if (track.Archived()?.val() === true) track.Archived('auto')!.val(false)
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
