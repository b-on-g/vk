namespace $.$$ {

	/**
	 * В chrome-extension/moz-extension контексте `location.origin` имеет схему
	 * `chrome-extension://`, и yard.web.ts пушит его в masters_default. Кроме того,
	 * peer-ы из Seed().peers() могут принести относительные URL, которые в extension
	 * резолвятся в chrome-extension://. Любой такой URL → `new WebSocket(...)` →
	 * SyntaxError. Чистим default-список и подкладываем актуальный baza-master.
	 *
	 * Master domain: `baza.91.219.148.98.ip.giper.dev` — IP-обёртка вокруг IP мастера
	 * (Meridian-deploy, см. memory/giper_baza_deploy_behind_meridian.md). Старый
	 * `baza.giper.dev` отвалился. Тот же URL хранится в bundled web.baza Seed:Peers,
	 * но на холодном старте yard может не успеть вытащить его до первого connect'а
	 * — поэтому ставим явный fallback.
	 */
	;(function fix_yard_masters_in_extension() {
		try {
			if (typeof location === 'undefined') return
			const proto = location.protocol
			if (proto !== 'chrome-extension:' && proto !== 'moz-extension:') return

			const FALLBACK_MASTER = 'https://baza.91.219.148.98.ip.giper.dev/'

			const yard = $giper_baza_yard as any
			const list: string[] = yard.masters_default
			for (let i = list.length - 1; i >= 0; i--) {
				if (!/^(http|https|ws|wss):/.test(list[i])) list.splice(i, 1)
			}
			// На случай если в каком-то билде остался стейл-URL — выкидываем.
			for (let i = list.length - 1; i >= 0; i--) {
				if (list[i] === 'https://baza.giper.dev/') list.splice(i, 1)
			}
			if (!list.includes(FALLBACK_MASTER)) list.push(FALLBACK_MASTER)

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

	/**
	 * Parsing share-токена из URL fragment. Не дёргаем baza здесь —
	 * только сохраняем токен в module-scope, чтобы $bog_vk_app.auto()
	 * запустил импорт реактивно через $mol_wire_async (с ретраем
	 * на baza-Promise'ы).
	 */
	let pending_share = ''
	;(function parse_share_hash() {
		try {
			if (typeof location === 'undefined') return
			const hash = location.hash || ''
			const match = hash.match(/[#&]share=([^&]+)/)
			if (!match) return
			pending_share = decodeURIComponent(match[1])
		} catch (e: any) {
			console.warn('[app] share hash parse failed:', e?.message)
		}
	})()

	export class $bog_vk_app extends $.$bog_vk_app {

		title() {
			return 'Bog Music'
		}

		@$mol_mem
		page(next?: string) {
			if (next !== undefined) {
				// Клик на табе "Расшаренный" в режиме шаринга — финализирует шар,
				// не переключая страницу.
				if (next === 'share') {
					this.submit_share()
					return $mol_state_arg.value('page') ?? 'my'
				}
				$mol_state_arg.value('page', next)
				return next
			}
			return $mol_state_arg.value('page') ?? 'my'
		}

		archive_mode() {
			return this.page() === 'archive'
		}

		// =========================================================================
		// Share — sender flow: long-press → multi-select → submit_share
		//                     single click → instant share
		// =========================================================================

		@$mol_mem
		share_mode(next?: boolean): boolean {
			return next ?? false
		}

		private _share_selection = new Set<string>()

		/** Реактивный счётчик для инвалидации share_selection и share_is_selected. */
		@$mol_mem
		private share_selection_version(next?: number): number {
			return next ?? 0
		}

		private bump_share_selection() {
			this.share_selection_version(this.share_selection_version() + 1)
		}

		share_selection_size(): number {
			this.share_selection_version()
			return this._share_selection.size
		}

		share_is_selected(audio: $bog_vk_api_audio | null): boolean {
			if (!audio) return false
			this.share_selection_version()
			return this._share_selection.has(this.cache_key(audio))
		}

		/** Long-press: вход в режим шаринга + добавление текущего трека. */
		share_enter(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			this._share_selection.clear()
			this._share_selection.add(this.cache_key(audio))
			this.bump_share_selection()
			this.share_mode(true)
		}

		share_toggle(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			const k = this.cache_key(audio)
			if (this._share_selection.has(k)) this._share_selection.delete(k)
			else this._share_selection.add(k)
			this.bump_share_selection()
		}

		share_exit() {
			this._share_selection.clear()
			this.bump_share_selection()
			this.share_mode(false)
		}

		@$mol_mem
		share_status(next?: string): string {
			return next ?? ''
		}

		share_selected_audios(): $bog_vk_api_audio[] {
			this.share_selection_version()
			const sel = this._share_selection
			if (!sel.size) return []
			// Шарить можно из любого вью (моя/архив/shared:X), поэтому собираем
			// audios по cache_key из всего dict — Playlist здесь не важен.
			const dict = this.tracks_dict()
			const out: $bog_vk_api_audio[] = []
			for (const k of sel) {
				const trk = dict.key(k)
				if (!trk) continue
				const vk_id = trk.Vk_id()?.val() ?? String(k)
				const parts = String(vk_id).split('_')
				const owner_id = Number(parts[0])
				const id = Number(parts[1])
				if (!Number.isFinite(owner_id) || !Number.isFinite(id)) continue
				out.push({
					id,
					owner_id,
					artist: trk.Artist()?.val() ?? '',
					title: trk.Title()?.val() ?? '',
					duration: trk.Duration()?.val() ?? 0,
					url: trk.Url()?.val() ?? '',
				})
			}
			return out
		}

		/** Click на share-иконке трека вне режима шаринга — мгновенный одиночный шар. */
		share_single(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			$mol_wire_async(this).share_one_async(audio)
		}

		async share_one_async(audio: $bog_vk_api_audio) {
			await this.do_share([audio])
		}

		/** Click на табе "Расшаренный" — финализирует мульти-шар. */
		submit_share() {
			$mol_wire_async(this).submit_share_async()
		}

		async submit_share_async() {
			// share_selected_audios читает tracks_dict — может бросать Promise.
			// Читаем безопасно ДО share_exit, чтобы не потерять selection при ретрае.
			let audios: $bog_vk_api_audio[] = []
			try {
				audios = await this.share_read(() => this.share_selected_audios())
			} catch (e: any) {
				if (!(e instanceof Promise)) console.warn('[share] read selection failed:', e?.message ?? e)
			}
			this.share_exit()
			if (!audios.length) {
				this.share_status('Нет выбранных треков')
				return
			}
			await this.do_share(audios)
		}

		private _share_doing = false

		/**
		 * Локальный ретрай чтения baza-значения. Без этого Promise всплывал бы
		 * через async/await до wire_async-fiber'а, и тот бы переретраивал ВСЁ
		 * `do_share` — c новым `$mol_crypto_sacred.make()` и `land_grab()` (PoW)
		 * на каждом ретрае. Бесконечная PoW-молотилка вешала main thread.
		 */
		private async share_read<T>(fn: () => T): Promise<T> {
			for (let i = 0; i < 30; i++) {
				try {
					return fn()
				} catch (e: any) {
					if (e instanceof Promise) {
						try { await e } catch {}
						continue
					}
					throw e
				}
			}
			throw new Error('baza read timeout')
		}

		/**
		 * Создаёт share-land с публичным чтением, шифрует sender + meta + buffer
		 * каждого трека одноразовым AES-ключом, кладёт ссылку в буфер обмена.
		 */
		private async do_share(audios: $bog_vk_api_audio[]) {
			if (this._share_doing) {
				console.log('[share] do_share: уже идёт другой шар, выхожу')
				return
			}
			this._share_doing = true
			this.share_status('Готовлю шар…')
			console.log('[share] do_share: старт, audios=', audios.length, audios.map(a => `${a.artist}-${a.title}`))
			try {
				const sender = await this.share_read(() =>
					(this.nickname_label() || '').trim() || 'Расшаренный'
				)
				console.log('[share] sender =', sender)

				const usable: { audio: $bog_vk_api_audio, blob: Blob }[] = []
				for (const audio of audios) {
					const blob = await this.share_read(() => this.local_blob(audio))
					console.log('[share] local_blob:', audio.artist, '-', audio.title, blob ? `${blob.size}b ${blob.type}` : 'NULL')
					if (blob) usable.push({ audio, blob })
				}
				console.log('[share] usable=', usable.length, '/', audios.length)
				if (!usable.length) {
					this.share_status('Нет блоб-данных для шаринга')
					return
				}

				// `glob.land_grab` дёргает `auth.grab` → `wire_sync(auth).generate` (PoW).
				// Этот wire_task кешируется ТОЛЬКО внутри одного fiber-context'а. Между
				// нашими async-await тиками (мы вне фибры) — пересоздаётся, новый PoW.
				// Решение: прямо awaitим публичный async `generate()` параллельно, и
				// пушим серилизацию каждого в `embryos` (по одному auth на каждый
				// создаваемый land). `grab` пополняет из embryos без PoW.
				const auth_class = $giper_baza_auth as any
				const needed_lands = usable.length + 1 // 1 share-land + по 1 на каждый file
				const have = auth_class.embryos?.length ?? 0
				const to_gen = Math.max(0, needed_lands - have)
				console.log('[share] auths: have=', have, 'need=', needed_lands, 'gen=', to_gen)
				if (to_gen > 0) {
					this.share_status(`Генерирую ключи (${to_gen})…`)
					const t0 = performance.now()
					const generated = await Promise.all(
						Array.from({ length: to_gen }, () => auth_class.generate())
					)
					for (const g of generated) {
						auth_class.embryos.push(g.toString() + g.toStringPrivate())
					}
					console.log('[share] auths generated in', Math.round(performance.now() - t0), 'ms, embryos size=', auth_class.embryos.length)
				}

				this.share_status('Шифрую…')
				const key = $mol_crypto_sacred.make()
				console.log('[share] AES key created, base64=', key.toString().slice(0, 12) + '…')
				const sender_cipher = await this.share_encrypt(key, $mol_charset_encode(sender))
				const verifier_cipher = await this.share_encrypt(key, $mol_charset_encode('bog-vk-share-v1'))
				console.log('[share] sender_cipher bytes=', sender_cipher.byteLength, 'verifier_cipher bytes=', verifier_cipher.byteLength)

				type Cipher = { audio: $bog_vk_api_audio, mime: string, meta: Uint8Array, blob: Uint8Array }
				const ciphers: Cipher[] = []
				for (const { audio, blob } of usable) {
					try {
						const meta_json = JSON.stringify({
							artist: audio.artist ?? '',
							title: audio.title ?? '',
							duration: Number(audio.duration) || 0,
							mime: blob.type || 'audio/mpeg',
							owner_id: audio.owner_id,
							id: audio.id,
						})
						const meta_cipher = await this.share_encrypt(key, $mol_charset_encode(meta_json))
						const buf = new Uint8Array(await blob.arrayBuffer())
						const blob_cipher = await this.share_encrypt(key, buf)
						ciphers.push({ audio, mime: blob.type || 'audio/mpeg', meta: meta_cipher, blob: blob_cipher })
						console.log('[share] cipher track:', audio.artist, '-', audio.title, 'meta=', meta_cipher.byteLength, 'blob=', blob_cipher.byteLength)
					} catch (e: any) {
						console.warn('[share] cipher failed:', audio?.title, e?.message ?? e)
					}
				}
				if (!ciphers.length) {
					this.share_status('Не удалось зашифровать ни один трек')
					return
				}
				console.log('[share] ciphers ready:', ciphers.length)

				// === Phase: запись в baza ВНУТРИ wire_async-фибры. Внешний async-цикл
				// с share_read не работает: `units_load` (IDB) — это wire_task на
				// $giper_baza_mine_idb.land<X>, и он кешируется ТОЛЬКО для одного
				// fiber-вызова. Снаружи каждый retry создаёт новый task / новый
				// IDB-запрос, share_read крутится впустую и упирается в timeout.
				this.share_status('Заливаю в baza…')
				console.log('[share] entering wire_async fiber for writes…')
				const t_fiber = performance.now()
				const land_link = await ($mol_wire_async(this) as any).do_share_writes_in_fiber(
					sender_cipher, verifier_cipher, ciphers
				) as string
				console.log('[share] fiber returned in', Math.round(performance.now() - t_fiber), 'ms, land_link=', land_link)

				if (!land_link) {
					this.share_status('Не удалось залить треки')
					return
				}

				const url = this.share_url_for(land_link, key.toString())
				console.log('[share] URL:', url)
				try {
					navigator.clipboard.writeText(url)
					this.share_status(`Скопировано: ${ciphers.length} ${this.plural_tracks(ciphers.length)}`)
					console.log('[share] clipboard write OK')
				} catch (e: any) {
					this.share_status('Ссылка: ' + url)
					console.warn('[share] clipboard failed:', e?.message)
				}
			} catch (e: any) {
				if (e instanceof Promise) {
					try { await e } catch {}
				}
				console.warn('[share] submit failed:', e?.message ?? e)
				this.share_status('Ошибка: ' + (e?.message ?? 'неизвестно'))
			} finally {
				this._share_doing = false
			}
		}

		private plural_tracks(n: number): string {
			const mod10 = n % 10
			const mod100 = n % 100
			if (mod10 === 1 && mod100 !== 11) return 'трек'
			if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'трека'
			return 'треков'
		}

		private share_url_for(link: string, key: string): string {
			const proto = location.protocol
			const base = (proto === 'chrome-extension:' || proto === 'moz-extension:')
				? 'https://b-on-g.github.io/vk/'
				: location.origin + location.pathname + location.search
			return base + '#share=' + link + '.' + key
		}

		private async share_encrypt(key: $mol_crypto_sacred, data: Uint8Array): Promise<Uint8Array> {
			const iv = crypto.getRandomValues(new Uint8Array(16))
			const ct = await key.encrypt(data as any, iv as any)
			const out = new Uint8Array(iv.length + ct.length)
			out.set(iv, 0)
			out.set(ct, iv.length)
			return out
		}

		private async share_decrypt(key: $mol_crypto_sacred, blob: Uint8Array): Promise<Uint8Array> {
			if (blob.length < 17) throw new Error('cipher too short')
			const iv = blob.slice(0, 16)
			const ct = blob.slice(16)
			return key.decrypt(ct as any, iv as any)
		}

		/**
		 * Sync-метод. Запускается через `$mol_wire_async(this).do_share_writes_in_fiber(…)`,
		 * чтобы все вложенные wire_task'и (`land_grab`, `units_load`, `ensure_lord`) кешировались
		 * как sub-tasks одной фибры — иначе на каждом ретрае создаётся новый IDB-запрос /
		 * новый land. На каждый ретрай тело перезапускается, но sub-task'и переиспользуются
		 * и возвращают закешированные результаты.
		 */
		private do_share_writes_in_fiber(
			sender_cipher: Uint8Array,
			verifier_cipher: Uint8Array,
			ciphers: { audio: $bog_vk_api_audio, mime: string, meta: Uint8Array, blob: Uint8Array }[],
		): string {
			console.log('[share/fiber] step 1: land_grab')
			const land = this.$.$giper_baza_glob.land_grab([[null, $giper_baza_rank_read]])
			console.log('[share/fiber] step 1 OK: link=', land.link().str)

			console.log('[share/fiber] step 2: write Sender/Verifier/Count')
			const data = land.Data($bog_vk_share_baza)
			data.Sender('auto')!.val(sender_cipher as Uint8Array<ArrayBuffer>)
			data.Verifier('auto')!.val(verifier_cipher as Uint8Array<ArrayBuffer>)
			data.Count('auto')!.val(ciphers.length)
			console.log('[share/fiber] step 2 OK: count=', ciphers.length)

			console.log('[share/fiber] step 3: dive into Tracks')
			const tracks = data.Tracks(null)!
			console.log('[share/fiber] step 3 OK')

			const file_lands: $giper_baza_land[] = []
			for (let i = 0; i < ciphers.length; i++) {
				const c = ciphers[i]
				console.log(`[share/fiber] step 4.${i + 1}: track key=`, this.cache_key(c.audio))
				const trk = tracks.key(this.cache_key(c.audio), 'auto')
				if (!trk) { console.warn('[share/fiber] trk null!'); continue }
				console.log(`[share/fiber] step 4.${i + 1}.a: write Meta`)
				trk.Meta('auto')!.val(c.meta as Uint8Array<ArrayBuffer>)
				console.log(`[share/fiber] step 4.${i + 1}.b: ensure File land`)
				const file_store = trk.File('auto')!.ensure([[null, $giper_baza_rank_read]])
				if (!file_store) { console.warn('[share/fiber] file_store null!'); continue }
				console.log(`[share/fiber] step 4.${i + 1}.c: file land link=`, file_store.land().link().str)
				file_store.buffer(c.blob as Uint8Array<ArrayBuffer>)
				file_store.type(c.mime)
				trk.File('auto')!.remote(file_store)
				file_lands.push(file_store.land())
				console.log(`[share/fiber] step 4.${i + 1}.d: track ${i + 1}/${ciphers.length} written`)
			}

			console.log('[share/fiber] step 5: explicit sync — share land')
			land.sync()
			console.log('[share/fiber] step 5 OK')
			for (let i = 0; i < file_lands.length; i++) {
				console.log(`[share/fiber] step 6.${i + 1}: sync file land`)
				file_lands[i].sync()
				console.log(`[share/fiber] step 6.${i + 1} OK`)
			}

			console.log('[share/fiber] DONE, returning link=', land.link().str)
			return land.link().str
		}

		// =========================================================================
		// Share — receiver flow: парсинг #share=<link>.<key>, дешифр, копирование
		// =========================================================================

		private _share_imported_tokens = new Set<string>()

		@$mol_mem
		share_import_status(next?: string): string {
			return next ?? ''
		}

		async import_share(token: string) {
			console.log('[import] start, token=', token.slice(0, 30) + '…')
			if (!token) return
			if (this._share_imported_tokens.has(token)) {
				console.log('[import] token already processed, skip')
				return
			}

			const dot = token.indexOf('.')
			if (dot <= 0) {
				console.warn('[import] no dot in token')
				this.share_import_status('Битая ссылка')
				this._share_imported_tokens.add(token)
				this.clear_share_hash()
				return
			}
			const link_str = token.slice(0, dot)
			const key_str = token.slice(dot + 1)
			console.log('[import] link_str=', link_str, 'key_str=', key_str.slice(0, 12) + '…')

			let key: $mol_crypto_sacred
			try {
				key = $mol_crypto_sacred.from(key_str)
				console.log('[import] AES key parsed')
			} catch (e: any) {
				console.warn('[import] AES key parse failed:', e?.message)
				this.share_import_status('Битый ключ')
				this._share_imported_tokens.add(token)
				this.clear_share_hash()
				return
			}

			try {
				const link = new $giper_baza_link(link_str)
				const land = this.$.$giper_baza_glob.Land(link)
				console.log('[import] land obtained, link=', link.str)

				this.share_import_status('Загружаю шар…')

				type Header = {
					sender_cipher: Uint8Array | null,
					verifier_cipher: Uint8Array | null,
					count: number,
					keys: readonly string[],
				}
				let header: Header | null = null
				for (let i = 0; i < 90; i++) {
					try {
						header = await ($mol_wire_async(this) as any).import_share_header_in_fiber(land) as Header
					} catch (e: any) {
						console.warn('[import] header poll iter', i, 'failed:', e?.message ?? e)
						await new Promise(r => setTimeout(r, 1000))
						continue
					}
					console.log(`[import] header poll iter ${i}: verifier=${!!header.verifier_cipher} sender=${!!header.sender_cipher} count=${header.count} keys=${header.keys.length}`)
					if (header.verifier_cipher) {
						if (header.count > 0 && header.keys.length >= header.count) break
						if (header.count === 0 && header.keys.length > 0) break
					}
					this.share_import_status(`Жду треки (${header.keys.length}/${header.count || '?'})…`)
					await new Promise(r => setTimeout(r, 1000))
				}

				if (!header || !header.verifier_cipher) {
					console.warn('[import] no verifier after polling')
					this.share_import_status('Шар не загрузился — попробуй позже')
					return
				}
				console.log('[import] header ready: count=', header.count, 'keys=', header.keys.length)

				let verifier: string
				try {
					verifier = $mol_charset_decode(await this.share_decrypt(key, header.verifier_cipher))
					console.log('[import] verifier decoded:', verifier)
				} catch (e: any) {
					console.warn('[import] verifier decrypt failed:', e?.message)
					this.share_import_status('Не тот ключ')
					this._share_imported_tokens.add(token)
					this.clear_share_hash()
					return
				}
				if (verifier !== 'bog-vk-share-v1') {
					console.warn('[import] verifier mismatch:', verifier)
					this.share_import_status('Не тот ключ')
					this._share_imported_tokens.add(token)
					this.clear_share_hash()
					return
				}

				const sender = header.sender_cipher && header.sender_cipher.byteLength > 0
					? $mol_charset_decode(await this.share_decrypt(key, header.sender_cipher))
					: 'Расшаренный'
				console.log('[import] sender =', sender)

				const playlist = 'shared:' + sender
				let imported = 0
				for (let i = 0; i < header.keys.length; i++) {
					const k = header.keys[i]
					console.log(`[import] track ${i + 1}/${header.keys.length} key=${k}`)
					try {
						type TrackData = { meta_cipher: Uint8Array, file_cipher: Uint8Array, file_mime: string }
						// Поллим — file-land мог залинковаться раньше, чем master
						// прислал его chunks. Внутри track-fiber'а проверяем, что
						// `file.buffer()` непустой; если пусто — sleep + retry.
						let td: TrackData | null = null
						for (let attempt = 0; attempt < 60; attempt++) {
							this.share_import_status(`Тяну ${i + 1}/${header.keys.length}${attempt ? ` (${attempt}с)` : ''}…`)
							try {
								td = await ($mol_wire_async(this) as any).import_share_track_in_fiber(land, k) as TrackData | null
							} catch (e: any) {
								console.warn(`[import] track ${k} fiber failed:`, e?.message ?? e)
							}
							if (td) break
							console.log(`[import] track ${k} ещё не пришёл, attempt=${attempt + 1}`)
							await new Promise(r => setTimeout(r, 1000))
						}
						if (!td) { console.warn('[import] track data null после 60с:', k); continue }
						console.log(`[import] track ${k}: meta=${td.meta_cipher.byteLength}b cipher=${td.file_cipher.byteLength}b`)
						const meta_json = $mol_charset_decode(await this.share_decrypt(key, td.meta_cipher))
						const meta = JSON.parse(meta_json)
						console.log(`[import] track meta:`, meta.artist, '-', meta.title)
						const t_dec = performance.now()
						const audio_buf = await this.share_decrypt(key, td.file_cipher)
						console.log(`[import] track ${k} decrypted ${audio_buf.byteLength}b in ${Math.round(performance.now() - t_dec)}ms`)

						const audio: $bog_vk_api_audio = {
							id: Number(meta.id),
							owner_id: Number(meta.owner_id),
							artist: String(meta.artist ?? ''),
							title: String(meta.title ?? ''),
							duration: Number(meta.duration ?? 0),
							url: '',
						}
						const mime = String(meta.mime || td.file_mime || 'audio/mpeg')
						console.log(`[import] track ${k} → save_in_fiber`)
						const t_save = performance.now()
						await ($mol_wire_async(this) as any).import_share_save_track_in_fiber(audio, mime, audio_buf, playlist)
						console.log(`[import] track ${k} saved in ${Math.round(performance.now() - t_save)}ms`)
						imported++
					} catch (e: any) {
						if (e instanceof Promise) throw e
						console.warn('[import] track import failed:', e?.message ?? e)
					}
				}
				console.log('[import] DONE, imported=', imported, '/', header.keys.length)

				this._share_imported_tokens.add(token)
				this.clear_share_hash()
				if (imported) {
					this.share_import_status(`От ${sender}: ${imported} ${this.plural_tracks(imported)}`)
					this.page(playlist)
				} else {
					this.share_import_status('Шар пустой')
				}
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[share] import failed:', e?.message ?? e)
				this.share_import_status('Не получилось: ' + (e?.message ?? 'ошибка'))
			}
		}

		/**
		 * Sync-метод. Под `$mol_wire_async` все вложенные wire_task'и
		 * (`units_load` для share-land, `Tracks.keys()`, etc.) кешируются как
		 * sub-task'и одной фибры — фибра ретраится на Promise'ах от async IDB-load
		 * и возвращает результат когда land загружен.
		 */
		private import_share_header_in_fiber(land: $giper_baza_land): {
			sender_cipher: Uint8Array | null,
			verifier_cipher: Uint8Array | null,
			count: number,
			keys: readonly string[],
		} {
			console.log('[import/header-fiber] step a: get data')
			const data = land.Data($bog_vk_share_baza)
			console.log('[import/header-fiber] step b: read Sender')
			const sender_cipher = (data.Sender()?.val() as Uint8Array | undefined) ?? null
			console.log('[import/header-fiber] step c: read Verifier')
			const verifier_cipher = (data.Verifier()?.val() as Uint8Array | undefined) ?? null
			console.log('[import/header-fiber] step d: read Count')
			const count = Number(data.Count()?.val() ?? 0)
			console.log('[import/header-fiber] step e: read Tracks dict')
			const tracks = data.Tracks()
			const keys = (tracks?.keys() ?? []) as string[]
			console.log('[import/header-fiber] DONE: sender=', !!sender_cipher, 'verifier=', !!verifier_cipher, 'count=', count, 'keys=', keys.length)
			return { sender_cipher, verifier_cipher, count, keys }
		}

		/**
		 * Sync-метод. В фибре читает Meta + File-blob одного трека —
		 * `units_load` шифр-блоб-land'а кешируется внутри фибры, ретраится
		 * пока baza не догрузит чанки файла.
		 */
		/**
		 * Sync-метод. `save_track`/`move_to_playlist`/`save_blob` — `@$mol_action`,
		 * могут бросить Promise при `units_load` home-land'а или ensure'е blob-land'а.
		 * Без этой обёртки wire_async ретраит ВСЁ `import_share` (включая 8MB AES-decrypt)
		 * на каждом Promise, что выглядит как зависание.
		 */
		private import_share_save_track_in_fiber(
			audio: $bog_vk_api_audio,
			mime: string,
			buf: Uint8Array,
			playlist: string,
		): boolean {
			console.log('[import/save-fiber] save_track')
			this.save_track(audio)
			console.log('[import/save-fiber] move_to_playlist:', playlist)
			this.move_to_playlist(audio, playlist)
			console.log('[import/save-fiber] save_blob bytes=', buf.byteLength)
			this.save_blob(audio, buf as Uint8Array<ArrayBuffer>, mime)
			console.log('[import/save-fiber] DONE')
			return true
		}

		private import_share_track_in_fiber(land: $giper_baza_land, key: string): {
			meta_cipher: Uint8Array,
			file_cipher: Uint8Array,
			file_mime: string,
		} | null {
			console.log('[import/track-fiber] start key=', key)
			const data = land.Data($bog_vk_share_baza)
			const tracks = data.Tracks()
			if (!tracks) { console.warn('[import/track-fiber] tracks dict null'); return null }
			const trk = tracks.key(key)
			if (!trk) { console.warn('[import/track-fiber] trk null for', key); return null }
			console.log('[import/track-fiber] reading Meta…')
			const meta_cipher = trk.Meta()?.val() as Uint8Array | undefined
			if (!meta_cipher || meta_cipher.byteLength === 0) { console.warn('[import/track-fiber] meta empty'); return null }
			console.log('[import/track-fiber] reading File link…')
			const file = trk.File()?.remote()
			if (!file) { console.warn('[import/track-fiber] file remote null'); return null }
			// `$bog_vk_atom_link_to_synced.remote()` зовёт `.land().sync()` но
			// глотает Promise — внутри fiber'а нам нужно, чтобы Promise пробросился
			// и фибра подождала. Вызываем sync напрямую.
			console.log('[import/track-fiber] forcing file land sync…')
			file.land().sync()
			console.log('[import/track-fiber] reading file.buffer…')
			const file_cipher = file.buffer()
			if (!file_cipher || file_cipher.byteLength === 0) { console.warn('[import/track-fiber] file buffer empty'); return null }
			console.log('[import/track-fiber] DONE meta=', meta_cipher.byteLength, 'cipher=', file_cipher.byteLength)
			return { meta_cipher, file_cipher, file_mime: file.type() || 'audio/mpeg' }
		}

		private clear_share_hash() {
			try {
				const new_hash = (location.hash || '').replace(/[#&]?share=[^&]*/, '').replace(/^#&/, '#')
				const new_url = location.origin + location.pathname + location.search + (new_hash && new_hash !== '#' ? new_hash : '')
				history.replaceState(null, '', new_url)
			} catch {}
			pending_share = ''
		}

		// =========================================================================
		// Динамические плейлисты от senders (для receiver-табов).
		// =========================================================================

		@$mol_mem
		shared_playlists(): { id: string, sender: string, count: number }[] {
			try {
				const dict = this.tracks_dict()
				const keys = (dict.keys() ?? []) as string[]
				const map = new Map<string, number>()
				for (const k of keys) {
					const trk = dict.key(k)
					if (!trk) continue
					const pl = trk.Playlist()?.val() ?? ''
					if (!pl.startsWith('shared:')) continue
					map.set(pl, (map.get(pl) ?? 0) + 1)
				}
				return Array.from(map.entries()).map(([id, count]) => ({
					id,
					sender: id.slice('shared:'.length),
					count,
				}))
			} catch (e: any) {
				if (e instanceof Promise) throw e
				return []
			}
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

		/** Треки в указанном плейлисте, отсортированные по Order (asc, fallback Added).
		 *  '' = main (default), 'archive' = архив, любой другой id — кастомный плейлист. */
		list_audios_in(playlist: string): $bog_vk_api_audio[] {
			const dict = this.tracks_dict()
			const keys = (dict.keys() ?? []) as string[]
			type Row = { audio: $bog_vk_api_audio, order: number, added: number }
			const rows: Row[] = []
			for (const key of keys) {
				const track = dict.key(key)
				if (!track) continue
				const track_playlist = track.Playlist()?.val() ?? ''
				if (track_playlist !== playlist) continue
				// Скрываем трек, пока blob не засинкается. fresh_files — свежезалит
				// локально на этой сессии; baza-buffer > 0 — чанки доехали. Глотаем
				// ВСЁ (включая Promise от sync и партиал-CBOR ошибки): подписка на
				// buffer-atom уже зарегистрирована → cell инвалидируется когда
				// чанки приедут. Если бросать Promise — весь список саспендится
				// из-за одного недосинканного трека.
				if (!this.fresh_files.has(key)) {
					try {
						const file = track.File()?.remote()
						const buf = file?.buffer()
						if (!buf || buf.byteLength === 0) continue
					} catch {
						continue
					}
				}
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

		/** Backward-compat обёртка: archived bool → playlist id. */
		list_audios(archived: boolean): $bog_vk_api_audio[] {
			return this.list_audios_in(archived ? 'archive' : '')
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
			const p = this.page()
			if (p === 'archive') return this.archived_audios()
			if (p === 'share') return this.share_selected_audios()
			if (p.startsWith('shared:')) return this.list_audios_in(p)
			return this.saved_audios()
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

		/** Обрез начала трека (сек). 0 = без обреза. */
		trim_start(audio: $bog_vk_api_audio): number {
			try {
				const track = this.tracks_dict().key(this.cache_key(audio))
				const v = Number(track?.Trim_start()?.val() ?? 0)
				return Number.isFinite(v) && v > 0 ? v : 0
			} catch (e: any) {
				if (e instanceof Promise) throw e
				return 0
			}
		}

		/** Обрез конца трека (сек). null/0 → fallback (полная длительность). */
		trim_end(audio: $bog_vk_api_audio, fallback: number): number {
			try {
				const track = this.tracks_dict().key(this.cache_key(audio))
				const raw = track?.Trim_end()?.val()
				if (raw == null) return fallback
				const v = Number(raw)
				return Number.isFinite(v) && v > 0 ? v : fallback
			} catch (e: any) {
				if (e instanceof Promise) throw e
				return fallback
			}
		}

		@$mol_action
		save_trim_start(audio: $bog_vk_api_audio, seconds: number): void {
			if (!audio) return
			const track = this.tracks_dict().key(this.cache_key(audio), 'auto')
			if (!track) return
			track.Trim_start('auto')!.val(Math.max(0, seconds))
		}

		@$mol_action
		save_trim_end(audio: $bog_vk_api_audio, seconds: number): void {
			if (!audio) return
			const track = this.tracks_dict().key(this.cache_key(audio), 'auto')
			if (!track) return
			track.Trim_end('auto')!.val(Math.max(0, seconds))
		}

		@$mol_action
		save_blob(audio: $bog_vk_api_audio, buffer: Uint8Array, mime: string): void {
			if (!audio) return
			const key = this.cache_key(audio)
			const t0 = performance.now()
			console.log('[save_blob] start key=', key, 'bytes=', buffer.byteLength)
			const dict = this.tracks_dict()
			console.log('[save_blob] dict ok')
			const track = dict.key(key, 'auto')
			if (!track) { console.warn('[save_blob] track null'); return }
			console.log('[save_blob] track ok, ensure file land (king_grab → PoW)…')
			const ensure_t = performance.now()
			// Blob лежит в ОТДЕЛЬНОМ land (king_grab с public read), НЕ в home land.
			// Иначе все 30 треков сваливаются в один pack из 7000+ юнитов и сливаются
			// одной транзакцией — 30+ MB через интернет = десятки секунд.
			// С отдельным land каждый blob синкается независимо и не блокирует home land.
			const store = track.File('auto')!.ensure([])
			console.log('[save_blob] ensure done in', Math.round(performance.now() - ensure_t), 'ms')
			if (!store) { console.warn('[save_blob] store null'); return }
			const buf_t = performance.now()
			store.buffer(buffer as Uint8Array<ArrayBuffer>)
			console.log('[save_blob] buffer written in', Math.round(performance.now() - buf_t), 'ms')
			store.type(mime || 'audio/mpeg')
			const remote_t = performance.now()
			// Без .remote(store) link существует только локально — в pack для пуша не попадает.
			track.File('auto')!.remote(store)
			console.log('[save_blob] remote linked in', Math.round(performance.now() - remote_t), 'ms')
			console.log('[save_blob] DONE total', Math.round(performance.now() - t0), 'ms')
		}

		@$mol_action
		save_local_track(file: File, buffer: Uint8Array): $bog_vk_api_audio | null {
			console.log('[upload/save] start file=', file.name)
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
			console.log('[upload/save] tracks_dict…')
			const dict = this.tracks_dict()
			const key = this.cache_key(audio)
			console.log('[upload/save] dict.key auto, key=', key)
			const track = dict.key(key, 'auto')
			if (!track) { console.warn('[upload/save] track null'); return null }
			console.log('[upload/save] write Vk_id/Title/Artist…')
			track.Vk_id('auto')!.val(key)
			track.Title('auto')!.val(title)
			track.Artist('auto')!.val(artist)
			if (track.Added()?.val() == null) track.Added('auto')!.val(Date.now())
			if (track.Order()?.val() == null) track.Order('auto')!.val(this.max_order() + 1)
			if (track.Playlist()?.val() == null) track.Playlist('auto')!.val('')
			console.log('[upload/save] ensure File land…')
			const store = track.File('auto')!.ensure([])
			console.log('[upload/save] ensure result:', store ? `link=${store.land().link().str}` : 'NULL')
			if (store) {
				console.log('[upload/save] write buffer/type/name/remote…')
				store.buffer(buffer as Uint8Array<ArrayBuffer>)
				store.type(file.type || 'audio/mpeg')
				if (file.name) store.name(file.name)
				track.File('auto')!.remote(store)
				console.log('[upload/save] file land written')
			}
			this.fresh_files.set(key, file)
			console.log('[upload/save] DONE')
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

		/** Перенести трек в плейлист по id (`''` = main, `'archive'` = архив). */
		@$mol_action
		move_to_playlist(audio: $bog_vk_api_audio, playlist: string): void {
			if (!audio) return
			const dict = this.tracks_dict()
			const track = dict.key(this.cache_key(audio))
			if (!track) return
			track.Playlist('auto')!.val(playlist)
		}

		@$mol_action
		archive_track(audio: $bog_vk_api_audio): void {
			this.move_to_playlist(audio, 'archive')
		}

		@$mol_action
		restore_track(audio: $bog_vk_api_audio): void {
			this.move_to_playlist(audio, '')
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

		// ---------- last session (current track + position) ----------

		/**
		 * Последняя прослушиваемая запись из профиля. Возвращает audio + position
		 * или null если ничего не сохранено / трек не найден в локальной баззе.
		 */
		last_session(): { audio: $bog_vk_api_audio, position: number } | null {
			try {
				const profile = this.$.$giper_baza_glob.home().land().Data($bog_vk_account_baza)
				const key = profile.Last_track_key()?.val() ?? ''
				if (!key) return null
				const position = Number(profile.Last_position()?.val() ?? 0) || 0
				const dict = this.tracks_dict()
				const track = dict.key(String(key))
				if (!track) return null
				const vk_id = track.Vk_id()?.val() ?? key
				const parts = String(vk_id).split('_')
				const owner_id = Number(parts[0])
				const id = Number(parts[1])
				if (!Number.isFinite(owner_id) || !Number.isFinite(id)) return null
				return {
					audio: {
						id,
						owner_id,
						artist: track.Artist()?.val() ?? '',
						title: track.Title()?.val() ?? '',
						duration: track.Duration()?.val() ?? 0,
						url: track.Url()?.val() ?? '',
					},
					position,
				}
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[app] last_session read failed:', e?.message)
				return null
			}
		}

		save_last_session(audio: $bog_vk_api_audio, position: number) {
			try {
				const profile = this.$.$giper_baza_glob.home().land().Data($bog_vk_account_baza)
				profile.Last_track_key('auto')!.val(this.cache_key(audio))
				profile.Last_position('auto')!.val(Math.max(0, position || 0))
			} catch (e: any) {
				if (e instanceof Promise) return
				console.warn('[app] save_last_session failed:', e?.message)
			}
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
			const opts: Record<string, string> = {
				my: my ? `Моя музыка ${my}` : 'Моя музыка',
				archive: arch ? `Архив ${arch}` : 'Архив',
			}
			if (this.share_mode()) {
				const n = this.share_selection_size()
				opts['share'] = n ? `Расшаренный ${n}` : 'Расшаренный'
			}
			for (const pl of this.shared_playlists()) {
				opts[pl.id] = `${pl.sender} ${pl.count}`
			}
			return opts as { my: string, archive: string }
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
			console.log('[upload] upload_files called, next=', next?.length ?? 'undefined')
			if (next?.length) {
				for (const file of next) {
					console.log('[upload] processing file:', file.name, file.size, file.type)
					try {
						console.log('[upload] reading arrayBuffer…')
						const buffer = new Uint8Array(($mol_wire_sync(file) as any).arrayBuffer())
						console.log('[upload] arrayBuffer ok, bytes=', buffer.byteLength)
						console.log('[upload] save_local_track…')
						this.save_local_track(file, buffer)
						console.log('[upload] save_local_track done')
					} catch (e: any) {
						if (e instanceof Promise) {
							console.log('[upload] caught Promise, throwing for @$mol_mem retry')
							throw e
						}
						console.warn('[upload] failed:', file.name, e?.message ?? e)
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
		feedback_open(next?: boolean) {
			return $mol_state_local.value('vk_feedback_open', next) ?? false
		}

		Feedback() {
			if (!this.feedback_open()) return null as any
			return super.Feedback()
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
		share_toast_text(): string {
			return this.share_status() || this.share_import_status() || ''
		}

		Share_toast() {
			if (!this.share_toast_text()) return null as any
			return super.Share_toast()
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
		// Ручной импорт VK-треков + фоновый префетч блобов (по кнопке).
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

		@$mol_mem
		prefetch_state(next?: { total: number, done: number, failed: number }) {
			return next ?? { total: 0, done: 0, failed: 0 }
		}

		@$mol_mem
		download_playlist_status(next?: string): string {
			return next ?? ''
		}

		/** Триггер: качает треки видимого плейлиста в baza (НЕ на ПК). */
		download_playlist() {
			$mol_wire_async(this).download_playlist_async()
			return null
		}

		async download_playlist_async() {
			// PWA/сайт: VK API недоступен, но локальные blob'ы засинканы из baza —
			// упаковываем что есть в zip и отдаём как файл. extension-режим
			// продолжает качать с VK и кеширует в baza (для синка на другие устройства).
			if (!$bog_vk_api.in_extension()) {
				await this.download_playlist_zip_async()
				return
			}
			const page = this.page()
			let items: $bog_vk_api_audio[]
			if (page === 'my') {
				items = this.vk_audios()
				if (!items.length) {
					this.download_playlist_status('Список VK пуст')
					return
				}
			} else {
				items = this.visible_audios()
				if (!items.length) {
					this.download_playlist_status('Плейлист пуст')
					return
				}
			}
			this.download_playlist_status(`Скачиваю ${items.length}…`)
			await this.prefetch_blobs(items)
			const s = this.prefetch_state()
			this.download_playlist_status(`Готово: ${s.done}/${s.total}${s.failed ? `, ошибок ${s.failed}` : ''}`)
		}

		/** PWA-путь: собирает локально засинканные blob'ы в ZIP (STORE) и триггерит браузерный download. */
		async download_playlist_zip_async() {
			const items = this.visible_audios()
			if (!items.length) {
				this.download_playlist_status('Плейлист пуст')
				return
			}
			this.download_playlist_status(`Архивирую 0/${items.length}…`)
			const files: { name: string, data: Uint8Array }[] = []
			let skipped = 0
			for (let i = 0; i < items.length; i++) {
				const audio = items[i]
				let blob: Blob | null = null
				try {
					blob = this.local_blob(audio)
				} catch (e: any) {
					if (e instanceof Promise) { try { await e } catch {}; i--; continue }
				}
				if (!blob) { skipped++; this.download_playlist_status(`Архивирую ${files.length}/${items.length}…`); continue }
				try {
					const buf = new Uint8Array(await blob.arrayBuffer())
					files.push({ name: this.zip_filename(audio, files.length + 1, blob.type), data: buf })
				} catch (e: any) {
					skipped++
					console.warn('[zip] read failed:', audio.artist, '—', audio.title, '|', e?.message ?? String(e))
				}
				this.download_playlist_status(`Архивирую ${files.length}/${items.length}…`)
			}
			if (!files.length) {
				this.download_playlist_status('Нет локально доступных треков для архива')
				return
			}
			this.download_playlist_status('Собираю zip…')
			const zip_ab = this.build_zip(files)
			const blob = new Blob([zip_ab], { type: 'application/zip' })
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `vk-playlist-${new Date().toISOString().slice(0, 10)}.zip`
			document.body.appendChild(a)
			a.click()
			a.remove()
			setTimeout(() => URL.revokeObjectURL(url), 1000)
			const skipped_note = skipped ? `, пропущено ${skipped}` : ''
			this.download_playlist_status(`Готово: ${files.length} ${this.plural_tracks(files.length)}${skipped_note}`)
		}

		private zip_filename(audio: $bog_vk_api_audio, index: number, mime: string): string {
			const ext_map: Record<string, string> = {
				'audio/mpeg': 'mp3',
				'audio/mp3': 'mp3',
				'audio/mp4': 'm4a',
				'audio/aac': 'aac',
				'audio/ogg': 'ogg',
				'audio/webm': 'webm',
				'audio/wav': 'wav',
				'audio/flac': 'flac',
			}
			const ext = ext_map[(mime || '').toLowerCase()] || 'mp3'
			const safe = (s: string) => (s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 80)
			const num = String(index).padStart(3, '0')
			const artist = safe(audio.artist) || 'unknown'
			const title = safe(audio.title) || 'unknown'
			return `${num} - ${artist} - ${title}.${ext}`
		}

		private static _crc32_table: Uint32Array | null = null
		private static crc32_table() {
			if ($bog_vk_app._crc32_table) return $bog_vk_app._crc32_table
			const t = new Uint32Array(256)
			for (let i = 0; i < 256; i++) {
				let c = i
				for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
				t[i] = c
			}
			$bog_vk_app._crc32_table = t
			return t
		}
		private static crc32(data: Uint8Array): number {
			const t = $bog_vk_app.crc32_table()
			let crc = 0xFFFFFFFF
			for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ t[(crc ^ data[i]) & 0xFF]
			return (crc ^ 0xFFFFFFFF) >>> 0
		}

		/** STORE-only ZIP encoder (no compression — аудио и так сжато). */
		private build_zip(files: { name: string, data: Uint8Array }[]): ArrayBuffer {
			const enc = new TextEncoder()
			type Entry = { name: Uint8Array, data: Uint8Array, crc: number, offset: number }
			const entries: Entry[] = files.map(f => ({
				name: enc.encode(f.name),
				data: f.data,
				crc: $bog_vk_app.crc32(f.data),
				offset: 0,
			}))
			let local_size = 0
			let cd_size = 0
			for (const e of entries) {
				local_size += 30 + e.name.length + e.data.length
				cd_size += 46 + e.name.length
			}
			const ab = new ArrayBuffer(local_size + cd_size + 22)
			const buf = new Uint8Array(ab)
			const view = new DataView(ab)
			let off = 0
			for (const e of entries) {
				e.offset = off
				view.setUint32(off, 0x04034b50, true)
				view.setUint16(off + 4, 20, true)
				view.setUint16(off + 6, 0x0800, true) // UTF-8 filename
				view.setUint16(off + 8, 0, true) // STORE
				view.setUint16(off + 10, 0, true)
				view.setUint16(off + 12, 0, true)
				view.setUint32(off + 14, e.crc, true)
				view.setUint32(off + 18, e.data.length, true)
				view.setUint32(off + 22, e.data.length, true)
				view.setUint16(off + 26, e.name.length, true)
				view.setUint16(off + 28, 0, true)
				buf.set(e.name, off + 30)
				buf.set(e.data, off + 30 + e.name.length)
				off += 30 + e.name.length + e.data.length
			}
			const cd_off = off
			for (const e of entries) {
				view.setUint32(off, 0x02014b50, true)
				view.setUint16(off + 4, 20, true)
				view.setUint16(off + 6, 20, true)
				view.setUint16(off + 8, 0x0800, true)
				view.setUint16(off + 10, 0, true)
				view.setUint16(off + 12, 0, true)
				view.setUint16(off + 14, 0, true)
				view.setUint32(off + 16, e.crc, true)
				view.setUint32(off + 20, e.data.length, true)
				view.setUint32(off + 24, e.data.length, true)
				view.setUint16(off + 28, e.name.length, true)
				view.setUint16(off + 30, 0, true)
				view.setUint16(off + 32, 0, true)
				view.setUint16(off + 34, 0, true)
				view.setUint16(off + 36, 0, true)
				view.setUint32(off + 38, 0, true)
				view.setUint32(off + 42, e.offset, true)
				buf.set(e.name, off + 46)
				off += 46 + e.name.length
			}
			view.setUint32(off, 0x06054b50, true)
			view.setUint16(off + 4, 0, true)
			view.setUint16(off + 6, 0, true)
			view.setUint16(off + 8, entries.length, true)
			view.setUint16(off + 10, entries.length, true)
			view.setUint32(off + 12, cd_size, true)
			view.setUint32(off + 16, cd_off, true)
			view.setUint16(off + 20, 0, true)
			return ab
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
		 * Реактивно прокликивает все File-ссылки треков — `$bog_vk_atom_link_to_synced`
		 * (см. track_baza.ts) при `.remote()` сам зовёт `.land().sync()` на blob-land.
		 *
		 * **БЫЛО `@$mol_mem`** — это side-effect в чистом вычислении (sync() пишет
		 * в атомы yard'а), invalidation cycle лочит main thread. Per MOL_QUICK_START
		 * #circular-subscription — @$mol_mem может ТОЛЬКО читать. Поэтому теперь
		 * `@$mol_action`: одноразовый wire_task, не подписывается → не зацикливается.
		 *
		 * Триггеримся вручную из auto() через `$mol_wire_async`, фибра ретраит
		 * на baza-Promise'ах. Идемпотентность (`if remote()` — null-check) делает
		 * повторы безопасными.
		 */
		@$mol_action
		prefetch_blob_lands(): number {
			const dict = this.tracks_dict()
			const audios = [
				...this.list_audios(false),
				...this.list_audios(true),
			]
			let touched = 0
			for (const audio of audios) {
				const track = dict.key(this.cache_key(audio))
				if (!track) continue
				if (track.File()?.remote()) touched++
			}
			return touched
		}

		private _share_import_started = false

		// =========================================================================
		// Очередь pending-треков от content.js. Поток: vk.com → background.js (SW)
		// → IDB (`bog_vk_pending` / `pending` store) в chrome-extension origin.
		// popup и offscreen — тот же origin, видят тот же IDB.
		// Здесь читаем store, save_track + save_blob в Giper Baza, удаляем запись.
		// =========================================================================

		@$mol_mem
		pending_keys_version(next?: number): number {
			return next ?? 0
		}

		private _pending_listener_set = false

		private setup_pending_listener() {
			if (this._pending_listener_set) return
			const ext = (globalThis as any).chrome
			if (!ext?.runtime?.onMessage?.addListener) return
			this._pending_listener_set = true
			ext.runtime.onMessage.addListener((msg: any) => {
				if (msg?.target !== 'popup' || msg.type !== 'pending_added') return
				this.pending_keys_version(this.pending_keys_version() + 1)
			})
		}

		private open_pending_db(): Promise<IDBDatabase> {
			return new Promise((resolve, reject) => {
				const req = indexedDB.open('bog_vk_pending', 1)
				req.onupgradeneeded = () => {
					const db = req.result
					if (!db.objectStoreNames.contains('pending')) {
						db.createObjectStore('pending', { keyPath: 'key' })
					}
				}
				req.onsuccess = () => resolve(req.result)
				req.onerror = () => reject(req.error)
			})
		}

		private _draining = false

		/**
		 * Sync-метод. Запускается через `$mol_wire_async(this).save_entry_in_fiber(...)`.
		 *
		 * **Зачем фибра**: `save_blob` → `track.File('auto').ensure([])` дёргает
		 * `glob.land_grab` → `auth.grab` → `wire_sync(auth).generate` (PoW).
		 * PoW-wire_task кешируется ТОЛЬКО внутри одной fiber-context'ы. Если save_blob
		 * запущен ВНЕ фибры — Promise-throw из ensure поднимается до drain_pending,
		 * wire_async ретраит ВЕСЬ drain → save_blob → ensure → новый PoW с нуля → ∞.
		 *
		 * Внутри фибры на Promise-throw фибра ретраит САМОЁ СЕБЯ, и PoW-task возвращает
		 * закешированный результат. Один проход — один PoW. См. share-flow:
		 * `do_share_writes_in_fiber`.
		 */
		private save_entry_in_fiber(entry: any): boolean {
			const raw = entry.buf
			const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
			this.save_track(entry.audio)
			this.save_blob(entry.audio, buf, entry.mime || 'audio/aac')
			return true
		}

		private async delete_pending_key(key: string): Promise<void> {
			const db = await this.open_pending_db()
			try {
				await new Promise<void>((resolve, reject) => {
					const tx = db.transaction(['pending'], 'readwrite')
					tx.objectStore('pending').delete(key)
					tx.oncomplete = () => resolve()
					tx.onerror = () => reject(tx.error)
					tx.onabort = () => reject(tx.error)
				})
			} finally {
				db.close()
			}
		}

		async drain_pending() {
			if (this._draining) { console.log('[drain] skip — already draining'); return }
			this._draining = true
			const drain_t0 = performance.now()
			console.log('[drain] enter')
			try {
				let iter = 0
				while (true) {
					iter++
					console.log(`[drain] iter ${iter}: open IDB…`)
					const db = await this.open_pending_db()
					let entries: any[] = []
					try {
						console.log(`[drain] iter ${iter}: getAll…`)
						entries = await new Promise<any[]>((resolve, reject) => {
							const tx = db.transaction(['pending'], 'readonly')
							const req = tx.objectStore('pending').getAll()
							req.onsuccess = () => resolve(req.result || [])
							req.onerror = () => reject(req.error)
						})
					} finally {
						db.close()
						console.log(`[drain] iter ${iter}: db closed (after read)`)
					}
					if (!entries.length) { console.log(`[drain] iter ${iter}: empty → break`); break }
					console.log(`[drain] iter ${iter}: got ${entries.length} entries`)
					for (let i = 0; i < entries.length; i++) {
						const entry = entries[i]
						const ekey = entry?.key
						console.log(`[drain] entry ${i + 1}/${entries.length} key=${ekey} buf=${entry?.buf?.byteLength ?? '?'}b → save in fiber…`)
						const fiber_t = performance.now()
						try {
							await ($mol_wire_async(this) as any).save_entry_in_fiber(entry)
							console.log(`[drain] entry ${ekey}: saved in fiber in`, Math.round(performance.now() - fiber_t), 'ms')
						} catch (e: any) {
							// Promise здесь быть не должно (фибра внутри его съела).
							// Если есть — лог и идём дальше, чтобы не висеть на записи.
							console.warn(`[drain] entry ${ekey}: fiber failed:`, e?.message ?? e)
							continue
						}
						try {
							await this.delete_pending_key(ekey)
							console.log(`[drain] entry ${ekey}: deleted from IDB ✓`)
						} catch (e: any) {
							console.warn(`[drain] entry ${ekey}: delete failed:`, e?.message ?? e)
						}
					}
				}
			} finally {
				this._draining = false
				console.log('[drain] exit, total', Math.round(performance.now() - drain_t0), 'ms')
			}
		}

		auto() {
			// Прогрев чтения из baza — кидает Promise при загрузке, ретраится здесь.
			try { this.saved_audios() } catch (e: any) {
				if (e instanceof Promise) throw e
			}
			// Тачим blob-lands всех треков — синк блобов идёт фоном параллельно.
			// Через wire_async (а не sync-вызов в auto) чтобы Promise'ы от baza-load
			// ретраились в отдельной фибре и не лочили основной auto-fiber.
			$mol_wire_async(this).prefetch_blob_lands()
			// Одноразовая миграция блоб-линков (паттерн giper_baza_link_remote).
			if (!this._migration_done) {
				try {
					this.migrate_blob_links()
					this._migration_done = true
				} catch (e: any) {
					if (e instanceof Promise) throw e
				}
			}
			// Импорт шара из URL (#share=…) — wire_async ретраит на baza-Promise'ах.
			if (pending_share && !this._share_import_started) {
				this._share_import_started = true
				$mol_wire_async(this).import_share(pending_share)
			}
			// Дренаж pending-очереди от content.js. Подписка на version →
			// перезапуск при pending_added-сообщении от background.js.
			this.setup_pending_listener()
			this.pending_keys_version()
			$mol_wire_async(this).drain_pending()
			return super.auto()
		}
	}
}
