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
	 * `content.js` пишет VK-токен в `chrome.storage.local` (изолированный
	 * world content script-а), а $bog_vk_api.token() читает из `localStorage`
	 * через $mol_state_local. Без моста popup никогда не видит токен.
	 *
	 * Подписка onChanged держит синхронизацию live: пользователь зашёл на
	 * vk.com с открытым popup → токен подхватился без перезапуска.
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

		/** Активные треки из Giper Baza home land. */
		@$mol_mem
		synced_audios(): $bog_vk_api_audio[] {
			try {
				return $bog_vk_store.saved_audios()
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[app] baza read failed:', e?.message)
				return []
			}
		}

		@$mol_mem
		archived_audios(): $bog_vk_api_audio[] {
			try {
				return $bog_vk_store.archived_audios()
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[app] baza read failed:', e?.message)
				return []
			}
		}

		@$mol_mem
		visible_audios() {
			return this.archive_mode() ? this.archived_audios() : this.synced_audios()
		}

		tab_options() {
			const my = this.synced_audios().length
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
			try { $bog_vk_store.save_track(moving) } catch (e: any) { if (e instanceof Promise) return }
			if (from < to) {
				for (let i = from; i < to; i++) {
					const next = list[i + 1]
					if (!next) break
					try { $bog_vk_store.save_track(next) } catch (e: any) { if (e instanceof Promise) return }
					try { $bog_vk_store.swap_order(moving, next) } catch (e: any) {
						if (e instanceof Promise) return
						console.warn('[app] reorder_to swap failed:', e?.message)
					}
				}
			} else {
				for (let i = from; i > to; i--) {
					const prev = list[i - 1]
					if (!prev) break
					try { $bog_vk_store.save_track(prev) } catch (e: any) { if (e instanceof Promise) return }
					try { $bog_vk_store.swap_order(moving, prev) } catch (e: any) {
						if (e instanceof Promise) return
						console.warn('[app] reorder_to swap failed:', e?.message)
					}
				}
			}
		}

		@$mol_action
		archive_audio(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			try { $bog_vk_store.save_track(audio) } catch (e: any) { if (e instanceof Promise) return }
			try { $bog_vk_store.archive_track(audio) } catch (e: any) {
				if (e instanceof Promise) return
				console.warn('[app] baza archive failed:', e?.message)
			}
		}

		@$mol_action
		restore_audio(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			try { $bog_vk_store.restore_track(audio) } catch (e: any) {
				if (e instanceof Promise) return
				console.warn('[app] baza restore failed:', e?.message)
			}
		}

		@$mol_action
		delete_audio(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			try { $bog_vk_store.delete_track(audio) } catch (e: any) {
				if (e instanceof Promise) return
				console.warn('[app] baza delete failed:', e?.message)
			}
		}

		@$mol_action
		on_play_audio(audio?: $bog_vk_api_audio | null) {
			if (!audio) return

			const audios = this.visible_audios()
			const idx = audios.findIndex((a: $bog_vk_api_audio) => a.id === audio.id && a.owner_id === audio.owner_id)
			this.Player().queue_index(idx >= 0 ? idx : 0)
			this.Player().play_track(audio)

			try { $bog_vk_store.save_track(audio) } catch (e: any) {
				if (e instanceof Promise) return
				console.warn('[app] baza save failed:', e?.message)
			}

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
						$bog_vk_store.save_local_track(file, buffer)
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
				const land = $bog_vk_account.profile()
				return land.Nickname()?.val() || ''
			} catch (e) {
				if (e instanceof Promise) throw e
				return ''
			}
		}

		Nickname_label() {
			if (!this.nickname_label()) return null as any
			return super.Nickname_label()
		}

		/**
		 * Авто-импорт треков из VK в Giper Baza.
		 * Вызывается реактивно из auto() — `@$mol_mem` ретраит при появлении
		 * токена / готовности baza. Идемпотентно (save_track обновляет только
		 * изменившиеся поля), так что вызов на каждом тике безопасен.
		 *
		 * Фоном дёргает `prefetch_blobs` для треков без `File` в baza, чтобы сразу
		 * после синка metadata пользователь мог играть offline.
		 */
		@$mol_mem
		auto_import() {
			if (!$bog_vk_api.in_extension()) return null
			const token = $bog_vk_api.token()
			if (!token) return null
			let list: $bog_vk_api_audio_list
			try {
				list = $bog_vk_api.my_audios()
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[app] auto_import fetch failed:', e?.message)
				return null
			}
			const items = list?.items ?? []
			if (!items.length) return null
			for (const audio of items) {
				try { $bog_vk_store.save_track(audio) } catch (e: any) {
					if (e instanceof Promise) throw e
					console.warn('[app] auto_import save failed:', audio.title, e?.message)
				}
			}
			// Качаем блобы тех, у кого их в baza ещё нет — последовательно, чтобы
			// не ддосить VK CDN. Фоном, без блокировки UI.
			try { ($mol_wire_async($bog_vk_app) as any).prefetch_blobs(items) } catch {}
			return items.length
		}

		/**
		 * Последовательно скачивает HLS для треков, у которых в baza нет файла.
		 * `save_hls` идемпотентен (проверяет `is_cached`), так что повторные
		 * вызовы безопасны. Запускается из auto_import фоном.
		 *
		 * VK `audio.get` отдаёт треки БЕЗ url — приходится запрашивать его через
		 * `audio.getById` для каждого трека отдельно перед скачиванием HLS.
		 */
		static async prefetch_blobs(items: $bog_vk_api_audio[]) {
			if (!items?.length) return
			let downloaded = 0, failed = 0
			console.log('[app] prefetch start:', items.length, 'tracks')
			for (const audio of items) {
				try {
					if ($bog_vk_cache.is_cached(audio)) continue
					let target = audio
					if (!target.url) {
						const key = `${audio.owner_id}_${audio.id}${audio.access_key ? '_' + audio.access_key : ''}`
						const fresh = ($mol_wire_sync($bog_vk_api) as any).refresh_audio(key) as $bog_vk_api_audio | null
						if (!fresh?.url) { failed++; continue }
						target = { ...audio, url: fresh.url }
					}
					await $bog_vk_cache.save_hls(target)
					downloaded++
				} catch (e: any) {
					if (e instanceof Promise) continue
					failed++
					console.warn('[app] prefetch failed:', audio.title, e?.message)
				}
			}
			console.log('[app] prefetch done:', downloaded, 'downloaded,', failed, 'failed')
		}

		auto() {
			try { $bog_vk_store.saved_audios() } catch {}
			try { this.auto_import() } catch (e: any) {
				if (e instanceof Promise) throw e
			}
			return super.auto()
		}
	}
}
