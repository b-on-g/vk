namespace $.$$ {

	/**
	 * В chrome-extension/moz-extension контексте `location.origin` имеет схему
	 * `chrome-extension://`, и yard.web.ts пушит его в masters_default. Кроме того,
	 * peer-ы из Seed().peers() могут принести относительные URL, которые в extension
	 * резолвятся в chrome-extension://. Любой такой URL → `new WebSocket(...)` →
	 * SyntaxError. Чистим default-список и подкладываем публичный baza-master.
	 */
	;(function fix_yard_masters_in_extension() {
		try {
			if (typeof location === 'undefined') return
			const proto = location.protocol
			if (proto !== 'chrome-extension:' && proto !== 'moz-extension:') return

			const yard = $giper_baza_yard as any
			const list: string[] = yard.masters_default
			for (let i = list.length - 1; i >= 0; i--) {
				if (!/^(http|https|ws|wss):/.test(list[i])) list.splice(i, 1)
			}
			if (!list.includes('https://baza.giper.dev/')) list.push('https://baza.giper.dev/')

			if (!yard.__bog_vk_masters_patched) {
				const orig = yard.masters.bind(yard)
				Object.defineProperty(yard, 'masters', {
					configurable: true,
					value: function() {
						const all = orig() as string[]
						return all.filter(url => /^(http|https|ws|wss):/.test(url))
					},
				})
				yard.__bog_vk_masters_patched = true
			}
		} catch (e: any) {
			console.warn('[app] yard masters fix failed:', e?.message)
		}
	})()

	/**
	 * Мост `chrome.storage.local.vk_token` → `localStorage.vk_token`.
	 */
	;(function bridge_vk_token_from_chrome_storage() {
		try {
			const ext = (globalThis as any).chrome
			if (!ext?.storage?.local?.get) return
			const apply = (token: string) => {
				if (!token) return
				try {
					if (window.localStorage.getItem('vk_token') === JSON.stringify(token)) return
					window.localStorage.setItem('vk_token', JSON.stringify(token))
					window.dispatchEvent(new StorageEvent('storage', { key: 'vk_token' }))
				} catch (e: any) {
					console.warn('[app] vk_token write failed:', e?.message)
				}
			}
			ext.storage.local.get(['vk_token'], (r: any) => apply(r?.vk_token ?? ''))
			ext.storage.onChanged?.addListener?.((changes: any, area: string) => {
				if (area !== 'local' || !changes?.vk_token) return
				apply(changes.vk_token.newValue ?? '')
			})
		} catch (e: any) {
			console.warn('[app] vk_token bridge failed:', e?.message)
		}
	})()

	/**
	 * Импорт ЛК из URL вида `#account=<key>`. Должен сработать ДО первого
	 * обращения к $giper_baza_auth.current(), поэтому выполняется на уровне
	 * модуля (IIFE).
	 */
	;(function import_account_from_hash() {
		try {
			if (typeof location === 'undefined') return
			const hash = location.hash || ''
			const match = hash.match(/[#&]account=([^&]+)/)
			if (!match) return
			const key = decodeURIComponent(match[1])
			if (key.length < 172) {
				console.warn('[app] account key too short, ignoring')
				return
			}
			const current = $mol_state_local.value('$giper_baza_auth')
			$mol_state_local.value('$giper_baza_auth', key)
			const clean_hash = hash.replace(/[#&]?account=[^&]*/, '').replace(/^#&/, '#')
			const new_url = location.origin + location.pathname + location.search + (clean_hash && clean_hash !== '#' ? clean_hash : '')
			history.replaceState(null, '', new_url)
			if (current !== key) location.reload()
		} catch (e: any) {
			console.warn('[app] account import failed:', e?.message)
		}
	})()

	export class $bog_vk_app extends $.$bog_vk_app {

		title() {
			return 'Bog Music'
		}

		@$mol_mem
		page(next?: string) {
			if (next !== undefined) {
				$mol_state_arg.value('page', next)
				return next
			}
			return $mol_state_arg.value('page') ?? 'my'
		}

		archive_mode() {
			return this.page() === 'archive'
		}

		// =========================================================================
		// Giper Baza store — паттерн blitz: instance-методы view'а, БЕЗ @$mol_mem
		// (memory: @$mol_mem на pawn-методах → destructor → Circular subscription)
		// =========================================================================

		/** $bog_vk_store в home land текущего юзера. */
		tracks_store(): $bog_vk_store {
			const home = this.$.$giper_baza_glob.home()
			return home.land().Data($bog_vk_store)
		}

		/** Словарь треков (Tracks). */
		tracks_dict() {
			return this.tracks_store().Tracks(null)!
		}

		// ---------- утилиты, не трогающие baza ----------

		cache_key(audio: $bog_vk_api_audio): string {
			return `${audio.owner_id}_${audio.id}`
		}

		parse_filename(name: string): { artist: string, title: string } {
			const base = name.replace(/\.[^.]+$/, '').trim()
			const m = base.match(/^(.+?)\s*[-–—]\s*(.+)$/)
			if (m) return { artist: m[1].trim(), title: m[2].trim() }
			return { artist: '', title: base }
		}

		/** Детерминированный hash (FNV-1a 32 bit). */
		hash_str(s: string): number {
			let h = 2166136261
			for (let i = 0; i < s.length; i++) {
				h ^= s.charCodeAt(i)
				h = Math.imul(h, 16777619)
			}
			return h >>> 0
		}

		// ---------- чтение из baza ----------

		/** RAM-кеш свежезагруженных файлов на текущей сессии. */
		private fresh_files = new Map<string, File>()

		/** Blob трека из baza или RAM. null если нет. */
		local_blob(audio: $bog_vk_api_audio): Blob | null {
			const key = this.cache_key(audio)
			const fresh = this.fresh_files.get(key)
			if (fresh) return fresh
			const dict = this.tracks_dict()
			const track = dict.key(key)
			if (!track) return null
			const file = track.File()?.remote()
			if (!file) return null
			const buf = file.buffer()
			if (!buf || buf.byteLength === 0) return null
			const type = file.type() || 'audio/mpeg'
			return new Blob([buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer], { type })
		}

		is_cached(audio: $bog_vk_api_audio): boolean {
			try {
				return this.local_blob(audio) !== null
			} catch (e: any) {
				if (e instanceof Promise) throw e
				return false
			}
		}

		/** Активные/архивные треки, отсортированные по Order (asc, fallback Added). */
		list_audios(archived: boolean): $bog_vk_api_audio[] {
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
				const order = order_val == null ? added : Number(order_val)
				rows.push({
					audio: {
						id,
						owner_id,
						artist: track.Artist()?.val() ?? '',
						title: track.Title()?.val() ?? '',
						duration: track.Duration()?.val() ?? 0,
						url: track.Url()?.val() ?? '',
					},
					order,
					added,
				})
			}
			rows.sort((a, b) => a.order !== b.order ? a.order - b.order : b.added - a.added)
			return rows.map(r => r.audio)
		}

		@$mol_mem
		saved_audios(): $bog_vk_api_audio[] {
			try {
				return this.list_audios(false)
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[app] saved_audios read failed:', e?.message)
				return []
			}
		}

		@$mol_mem
		archived_audios(): $bog_vk_api_audio[] {
			try {
				return this.list_audios(true)
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[app] archived_audios read failed:', e?.message)
				return []
			}
		}

		@$mol_mem
		visible_audios() {
			return this.archive_mode() ? this.archived_audios() : this.saved_audios()
		}

		// ---------- запись в baza (паттерн blitz: @$mol_action instance) ----------

		max_order(): number {
			const dict = this.tracks_dict()
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

		@$mol_action
		save_track(audio: $bog_vk_api_audio): void {
			if (!audio) return
			const dict = this.tracks_dict()
			const key = this.cache_key(audio)
			const track = dict.key(key, 'auto')
			if (!track) return
			if (track.Vk_id()?.val() !== key) track.Vk_id('auto')!.val(key)
			const title = audio.title ?? ''
			if (track.Title()?.val() !== title) track.Title('auto')!.val(title)
			const artist = audio.artist ?? ''
			if (track.Artist()?.val() !== artist) track.Artist('auto')!.val(artist)
			const dur = Number(audio.duration ?? 0)
			if (track.Duration()?.val() !== dur) track.Duration('auto')!.val(dur)
			if (audio.url && track.Url()?.val() !== audio.url) track.Url('auto')!.val(audio.url)
			if (track.Added()?.val() == null) track.Added('auto')!.val(Date.now())
			if (track.Order()?.val() == null) track.Order('auto')!.val(this.max_order() + 1)
		}

		@$mol_action
		save_blob(audio: $bog_vk_api_audio, buffer: Uint8Array, mime: string): void {
			if (!audio) return
			const dict = this.tracks_dict()
			const key = this.cache_key(audio)
			const track = dict.key(key, 'auto')
			if (!track) return
			// Blob лежит в ОТДЕЛЬНОМ land (king_grab с public read), НЕ в home land.
			// Иначе все 30 треков сваливаются в один pack из 7000+ юнитов и сливаются
			// одной транзакцией — 30+ MB через интернет = десятки секунд.
			// С отдельным land каждый blob синкается независимо и не блокирует home land.
			const store = track.File('auto')!.ensure([[null, $giper_baza_rank_read]])
			if (!store) return
			store.buffer(buffer as Uint8Array<ArrayBuffer>)
			store.type(mime || 'audio/mpeg')
			// Без .remote(store) link существует только локально — в pack для пуша не попадает.
			track.File('auto')!.remote(store)
		}

		@$mol_action
		save_local_track(file: File, buffer: Uint8Array): $bog_vk_api_audio | null {
			const { artist, title } = this.parse_filename(file.name)
			const id = this.hash_str(`${file.name}|${file.size}|${file.lastModified}`)
			const audio: $bog_vk_api_audio = {
				id,
				owner_id: 0,
				artist,
				title,
				duration: 0,
				url: '',
			}
			const dict = this.tracks_dict()
			const key = this.cache_key(audio)
			const track = dict.key(key, 'auto')
			if (!track) return null
			track.Vk_id('auto')!.val(key)
			track.Title('auto')!.val(title)
			track.Artist('auto')!.val(artist)
			if (track.Added()?.val() == null) track.Added('auto')!.val(Date.now())
			if (track.Order()?.val() == null) track.Order('auto')!.val(this.max_order() + 1)
			track.Archived('auto')!.val(false)
			// Blob — в отдельном land (см. save_blob).
			const store = track.File('auto')!.ensure([[null, $giper_baza_rank_read]])
			if (store) {
				store.buffer(buffer as Uint8Array<ArrayBuffer>)
				store.type(file.type || 'audio/mpeg')
				if (file.name) store.name(file.name)
				track.File('auto')!.remote(store)
			}
			this.fresh_files.set(key, file)
			return audio
		}

		@$mol_action
		swap_order(a: $bog_vk_api_audio, b: $bog_vk_api_audio): void {
			if (!a || !b) return
			const dict = this.tracks_dict()
			const ta = dict.key(this.cache_key(a), 'auto')
			const tb = dict.key(this.cache_key(b), 'auto')
			if (!ta || !tb) return
			const oa_raw = ta.Order()?.val()
			const ob_raw = tb.Order()?.val()
			const aa = Number(ta.Added()?.val() ?? 0)
			const ab = Number(tb.Added()?.val() ?? 0)
			const oa = oa_raw == null ? aa : Number(oa_raw)
			const ob = ob_raw == null ? ab : Number(ob_raw)
			const next_a = ob === oa ? oa + 1 : ob
			const next_b = ob === oa ? oa : oa
			ta.Order('auto')!.val(next_a)
			tb.Order('auto')!.val(next_b)
		}

		@$mol_action
		archive_track(audio: $bog_vk_api_audio): void {
			if (!audio) return
			const dict = this.tracks_dict()
			const track = dict.key(this.cache_key(audio))
			if (!track) return
			track.Archived('auto')!.val(true)
		}

		@$mol_action
		restore_track(audio: $bog_vk_api_audio): void {
			if (!audio) return
			const dict = this.tracks_dict()
			const track = dict.key(this.cache_key(audio))
			if (!track) return
			track.Archived('auto')!.val(false)
		}

		@$mol_action
		delete_track(audio: $bog_vk_api_audio): void {
			if (!audio) return
			const dict = this.tracks_dict()
			dict.cut(this.cache_key(audio))
		}

		@$mol_action
		drop_blob(audio: $bog_vk_api_audio): void {
			if (!audio) return
			const dict = this.tracks_dict()
			const track = dict.key(this.cache_key(audio))
			if (!track) return
			track.File('auto')!.val(null)
			this.fresh_files.delete(this.cache_key(audio))
		}

		/**
		 * Миграция: для треков с непустым buffer'ом форсит .remote(store).
		 * Старые блобы писались без этого вызова → не синкались.
		 */
		@$mol_action
		migrate_blob_links(): number {
			const dict = this.tracks_dict()
			const keys = (dict.keys() ?? []) as string[]
			let migrated = 0
			for (const key of keys) {
				const track = dict.key(key)
				if (!track) continue
				const file = track.File()?.remote()
				if (!file) continue
				const buf = file.buffer()
				if (!buf || buf.byteLength === 0) continue
				try {
					track.File('auto')!.remote(file)
					migrated++
				} catch (e: any) {
					if (e instanceof Promise) throw e
				}
			}
			if (migrated) console.log('[app] migrated', migrated, 'blob links for sync')
			return migrated
		}

		/** Качает HLS и сразу пишет в baza. Используется player'ом и prefetch. */
		async save_hls(audio: $bog_vk_api_audio): Promise<void> {
			try {
				if (this.is_cached(audio)) return
				const result = await $bog_vk_cache.download_hls(audio)
				if (!result) return
				this.save_blob(audio, result.buffer, result.mime)
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn(`[app] save_hls failed: ${audio.artist} — ${audio.title}:`, e?.message ?? e)
			}
		}

		// ---------- UI ----------

		tab_options() {
			const my = this.saved_audios().length
			const arch = this.archived_audios().length
			return {
				my: my ? `Моя музыка ${my}` : 'Моя музыка',
				archive: arch ? `Архив ${arch}` : 'Архив',
			}
		}

		@$mol_mem
		current_audio(next?: $bog_vk_api_audio | null): $bog_vk_api_audio | null {
			return next ?? null
		}

		@$mol_action
		reorder_to(args: { from: number, to: number } | null) {
			if (!args) return
			const { from, to } = args
			const list = this.visible_audios()
			if (from === to) return
			if (from < 0 || to < 0 || from >= list.length || to >= list.length) return
			const moving = list[from]
			if (!moving) return
			this.save_track(moving)
			if (from < to) {
				for (let i = from; i < to; i++) {
					const next = list[i + 1]
					if (!next) break
					this.save_track(next)
					this.swap_order(moving, next)
				}
			} else {
				for (let i = from; i > to; i--) {
					const prev = list[i - 1]
					if (!prev) break
					this.save_track(prev)
					this.swap_order(moving, prev)
				}
			}
		}

		@$mol_action
		archive_audio(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			this.save_track(audio)
			this.archive_track(audio)
		}

		@$mol_action
		restore_audio(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			this.restore_track(audio)
		}

		@$mol_action
		delete_audio(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			this.delete_track(audio)
		}

		@$mol_action
		on_play_audio(audio?: $bog_vk_api_audio | null) {
			if (!audio) return

			const audios = this.visible_audios()
			const idx = audios.findIndex((a: $bog_vk_api_audio) => a.id === audio.id && a.owner_id === audio.owner_id)
			this.Player().queue_index(idx >= 0 ? idx : 0)
			this.Player().play_track(audio)

			this.save_track(audio)

			const item = this.recsys_item(audio)
			if (item) {
				$bog_recsys.namespace('vk')
				try { $bog_recsys.feedback(item, 'play') } catch {}
			}
		}

		@$mol_mem
		upload_files(next?: File[]) {
			if (next?.length) {
				for (const file of next) {
					try {
						const buffer = new Uint8Array(($mol_wire_sync(file) as any).arrayBuffer())
						this.save_local_track(file, buffer)
					} catch (e: any) {
						if (e instanceof Promise) throw e
						console.warn('[app] upload failed:', file.name, e?.message)
					}
				}
			}
			return next ?? []
		}

		@$mol_mem
		account_open(next?: boolean) {
			return $mol_state_local.value('vk_account_open', next) ?? false
		}

		@$mol_mem
		wave_mode(next?: boolean) {
			return $mol_state_local.value('vk_wave_mode', next) ?? false
		}

		recsys_item(audio: $bog_vk_api_audio | null) {
			if (!audio) return null
			const tags: string[] = []
			if (audio.artist) tags.push('artist:' + audio.artist.toLowerCase().trim())
			return { id: `${audio.owner_id}_${audio.id}`, tags }
		}

		player_pick_next(current: $bog_vk_api_audio | null): $bog_vk_api_audio | null {
			if (!this.wave_mode()) return null
			const pool = this.visible_audios()
			if (!pool.length) return null
			const seed = this.recsys_item(current)
			const exclude = current ? [`${current.owner_id}_${current.id}`] : []
			$bog_recsys.namespace('vk')
			const items = pool.map((a: $bog_vk_api_audio) => this.recsys_item(a)).filter(Boolean) as { id: string, tags: string[] }[]
			const id_to_audio = new Map<string, $bog_vk_api_audio>()
			for (const a of pool as $bog_vk_api_audio[]) id_to_audio.set(`${a.owner_id}_${a.id}`, a)
			const picked = $bog_recsys.recommend(items, { seed, exclude, limit: 1 })[0]
			if (!picked) return null
			return id_to_audio.get(picked.id) ?? null
		}

		Account() {
			if (!this.account_open()) return null as any
			return super.Account()
		}

		@$mol_mem
		nickname_label() {
			try {
				const profile = this.$.$giper_baza_glob.home().land().Data($bog_vk_account_baza)
				return profile.Nickname()?.val() || ''
			} catch (e) {
				if (e instanceof Promise) throw e
				return ''
			}
		}

		Nickname_label() {
			if (!this.nickname_label()) return null as any
			return super.Nickname_label()
		}

		// =========================================================================
		// Реактивный авто-импорт VK-треков + фоновый префетч блобов.
		// =========================================================================

		/**
		 * Список треков из VK. @$mol_mem ретраит fetch при появлении токена.
		 * Возвращает пустой массив если не в extension / без токена.
		 */
		@$mol_mem
		vk_audios(): $bog_vk_api_audio[] {
			if (!$bog_vk_api.in_extension()) return []
			const token = $bog_vk_api.token()
			if (!token) return []
			try {
				const list = $bog_vk_api.my_audios()
				return list?.items ?? []
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[app] vk_audios fetch failed:', e?.message)
				return []
			}
		}

		/**
		 * Реактивная авторегистрация: при готовности baza + появлении треков
		 * стартует фоновый префетч. Идемпотентно через флаг.
		 */
		@$mol_mem
		auto_import(): number {
			const items = this.vk_audios()
			if (!items.length) return 0
			// прогрев dict — кидает Promise если baza ещё грузится, @$mol_mem ретраит.
			this.tracks_dict()
			if (!this._prefetch_started) {
				this._prefetch_started = true
				$mol_wire_async(this).prefetch_blobs(items)
			}
			return items.length
		}

		private _prefetch_started = false

		@$mol_mem
		prefetch_state(next?: { total: number, done: number, failed: number }) {
			return next ?? { total: 0, done: 0, failed: 0 }
		}

		/**
		 * Фоновый префетч — реактивный wire_async fiber, ретраит при Promise.
		 * Метаданные сохраняются по одному перед каждой выкачкой блоба, чтобы
		 * baza успевала пушить sand/seal мелкими пакетами.
		 */
		async prefetch_blobs(items: $bog_vk_api_audio[]) {
			if (!items?.length) return
			console.log('[app] prefetch start:', items.length, 'tracks')
			this.prefetch_state({ total: items.length, done: 0, failed: 0 })
			let done = 0, failed = 0
			for (let i = 0; i < items.length; i++) {
				const audio = items[i]
				try {
					this.save_track(audio)
					await new Promise(r => setTimeout(r, 50))
					if (this.is_cached(audio)) { done++; continue }
					let target = audio
					if (!target.url) {
						const key = `${audio.owner_id}_${audio.id}${audio.access_key ? '_' + audio.access_key : ''}`
						const resp = await $bog_vk_api.fetch_vk_direct('audio.getById', { audios: key }) as $bog_vk_api_audio[]
						const fresh = resp?.[0]
						if (!fresh?.url) {
							failed++
							console.warn('[app] no fresh url:', audio.artist, '—', audio.title)
							this.prefetch_state({ total: items.length, done, failed })
							continue
						}
						target = { ...audio, url: fresh.url }
					}
					await this.save_hls(target)
					done++
				} catch (e: any) {
					if (e instanceof Promise) {
						await e
						i--
						continue
					}
					failed++
					console.warn('[app] prefetch failed:', audio.artist, '—', audio.title, '|', e?.message ?? String(e))
				}
				this.prefetch_state({ total: items.length, done, failed })
			}
			console.log('[app] prefetch done:', done, 'downloaded,', failed, 'failed')
		}

		private _migration_done = false

		/**
		 * Реактивно ИНИЦИИРУЕТ sync blob-lands всех треков в фоне.
		 * Без явного `.land().sync()` blob-lands доступны через `Pawn(link)`,
		 * но yard их не подсасывает (в land.ts:345 строка `.sync()` закомменчена,
		 * так что Pawn() не запускает sync автоматически).
		 *
		 * `$mol_wire_solid()` держит этот cell живым между тиками — иначе $mol его
		 * рипает после первого вызова в auto() и blob-lands перестают тачиться.
		 */
		@$mol_mem
		prefetch_blob_lands(): number {
			$mol_wire_solid()
			const dict = this.tracks_dict()
			const keys = (dict.keys() ?? []) as string[]
			let synced = 0
			for (const key of keys) {
				const track = dict.key(key)
				if (!track) continue
				const file = track.File()?.remote()
				if (!file) continue
				try {
					file.land().sync()
					synced++
				} catch (e: any) {
					if (e instanceof Promise) continue
				}
			}
			return synced
		}

		auto() {
			// Прогрев чтения из baza — кидает Promise при загрузке, ретраится здесь.
			try { this.saved_audios() } catch (e: any) {
				if (e instanceof Promise) throw e
			}
			// Тачим blob-lands всех треков — синк блобов идёт фоном параллельно.
			try { this.prefetch_blob_lands() } catch (e: any) {
				if (e instanceof Promise) throw e
			}
			// Одноразовая миграция блоб-линков (паттерн giper_baza_link_remote).
			if (!this._migration_done) {
				try {
					this.migrate_blob_links()
					this._migration_done = true
				} catch (e: any) {
					if (e instanceof Promise) throw e
				}
			}
			// Реактивный авто-импорт.
			try { this.auto_import() } catch (e: any) {
				if (e instanceof Promise) throw e
			}
			return super.auto()
		}
	}
}
