namespace $.$$ {
	export class $bog_vk_app extends $.$bog_vk_app {
		@$mol_mem
		online(next?: boolean) {
			if (next !== undefined) return next
			const val = navigator.onLine
			window.addEventListener('online', () => this.online(true), { once: true })
			window.addEventListener('offline', () => this.online(false), { once: true })
			return val
		}

		@$mol_mem
		token_expired(next?: boolean) {
			return next ?? false
		}

		token_invalid() {
			const t = this.token()
			return !!t && !t.startsWith('vk1.a.')
		}

		offline_mode() {
			return !this.token() || this.token_invalid() || !this.online() || this.token_expired()
		}

		title() {
			if (this.offline_mode()) return 'Bog Music (offline)'
			return 'Bog Music'
		}

		@$mol_mem
		token(next?: string) {
			if (next !== undefined) {
				const extracted = this.extract_token(next)
				const cookies = this.extract_cookies(next)
				this.$.$bog_vk_api.token(extracted)
				if (cookies) this.$.$bog_vk_api.cookies(cookies)
				this.token_expired(false)
			}
			return this.$.$bog_vk_api.token()
		}

		extract_token(input: string): string {
			const trimmed = input.trim()
			const match = trimmed.match(/access_token=([^&\s'"]+)/)
			if (match) return match[1]
			const vk_match = trimmed.match(/vk1\.a\.[A-Za-z0-9_-]+/)
			if (vk_match) return vk_match[0]
			return trimmed
		}

		extract_cookies(input: string): string {
			const match = input.match(/-b\s+'([^']+)'/)
			if (match) return match[1]
			const match2 = input.match(/--cookie\s+'([^']+)'/)
			if (match2) return match2[1]
			return ''
		}

		@$mol_mem
		page(next?: string) {
			if (next !== undefined) {
				$mol_state_arg.value('page', next)
			}
			return $mol_state_arg.value('page') ?? 'my'
		}

		@$mol_action
		show_my() {
			this.page('my')
			this.search_query('')
		}

		@$mol_action
		show_search() {
			this.page('search')
		}

		@$mol_action
		show_archive() {
			this.page('archive')
			this.search_query('')
		}

		@$mol_mem
		cached_audios(): $bog_vk_api_audio[] {
			$bog_vk_cache.version()
			return ($mol_wire_sync($bog_vk_cache) as any).all_cached()
		}

		/**
		 * Персональные треки пользователя из Giper Baza — синкаются между устройствами.
		 * Возвращает массив примитивов, поэтому @$mol_mem безопасен.
		 */
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

		/** Архивные треки (мягко удалённые). */
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

		/** Множество ключей архивных треков — для фильтрации из VK-списка. */
		@$mol_mem
		archived_keys(): Set<string> {
			return new Set(this.archived_audios().map(a => `${a.owner_id}_${a.id}`))
		}

		/** Склейка cached + synced без дубликатов, с сортировкой по Order из baza. */
		merged_offline(): $bog_vk_api_audio[] {
			const cached = this.cached_audios()
			const synced = this.synced_audios()
			const archived = this.archived_keys()
			// Убираем из cached то, что помечено Archived.
			const cached_active = cached.filter(a => !archived.has(`${a.owner_id}_${a.id}`))
			if (!synced.length) return cached_active
			// synced уже отсортирован по Order. Берём его порядок, добавляем cached-only в конец.
			const by_key = new Map<string, $bog_vk_api_audio>()
			for (const a of cached_active) by_key.set(`${a.owner_id}_${a.id}`, a)
			const out: $bog_vk_api_audio[] = []
			const used = new Set<string>()
			for (const a of synced) {
				const key = `${a.owner_id}_${a.id}`
				// Берём cached если есть (там реальный URL для HLS).
				out.push(by_key.get(key) ?? a)
				used.add(key)
			}
			for (const a of cached_active) {
				const key = `${a.owner_id}_${a.id}`
				if (!used.has(key)) out.push(a)
			}
			return out
		}

		@$mol_mem
		my_audios() {
			if (this.offline_mode()) return this.ordered_online(this.merged_offline())
			try {
				const result = this.$.$bog_vk_api.my_audios()?.items ?? []
				this.token_expired(false)
				const archived = this.archived_keys()
				const active = result.filter((a: $bog_vk_api_audio) => !archived.has(`${a.owner_id}_${a.id}`))
				return this.ordered_online(active)
			} catch (e: any) {
				if (e instanceof Promise || e?.constructor?.name === '$mol_fail_hidden') throw e
				const msg = String(e?.message)
				if (msg.includes('expired') || msg.includes('authorization') || msg.includes('User authorization failed')) {
					this.token_expired(true)
				}
				console.warn('[app] API failed, using cache:', msg)
				return this.ordered_online(this.merged_offline())
			}
		}

		/**
		 * Переупорядочивает онлайн-список: сначала треки в порядке synced (Order из baza),
		 * затем те, что есть только в VK-списке.
		 */
		ordered_online(source: $bog_vk_api_audio[]): $bog_vk_api_audio[] {
			const synced = this.synced_audios()
			if (!synced.length) return source
			const by_key = new Map<string, $bog_vk_api_audio>()
			for (const a of source) by_key.set(`${a.owner_id}_${a.id}`, a)
			const out: $bog_vk_api_audio[] = []
			const used = new Set<string>()
			for (const s of synced) {
				const key = `${s.owner_id}_${s.id}`
				const found = by_key.get(key)
				if (found) {
					out.push(found)
					used.add(key)
				}
			}
			for (const a of source) {
				const key = `${a.owner_id}_${a.id}`
				if (!used.has(key)) out.push(a)
			}
			return out
		}

		@$mol_mem
		search_results() {
			const query = this.search_query().trim()
			if (!query) return []
			if (this.offline_mode()) return []
			return this.$.$bog_vk_api.search_audios(query)?.items ?? []
		}

		@$mol_mem
		visible_audios() {
			if (this.page() === 'archive') return this.archived_audios()
			if (this.page() === 'search' && this.search_query().trim()) {
				return this.search_results()
			}
			return this.my_audios()
		}

		/** В архиве показываем архивные как "текущий контекст", но UI-кнопки разные. */
		archive_mode() {
			return this.page() === 'archive'
		}

		@$mol_mem
		current_audio(next?: $bog_vk_api_audio | null): $bog_vk_api_audio | null {
			return next ?? null
		}

		@$mol_action
		reorder_up(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			const list = this.visible_audios()
			const idx = list.findIndex((a: $bog_vk_api_audio) => a.id === audio.id && a.owner_id === audio.owner_id)
			if (idx <= 0) return
			const prev = list[idx - 1]
			// Для треков, которые есть в VK но не в baza — сначала сохраняем в baza, чтобы Order появился.
			try { $bog_vk_store.save_track(audio) } catch (e: any) { if (e instanceof Promise) return }
			try { $bog_vk_store.save_track(prev) } catch (e: any) { if (e instanceof Promise) return }
			try { $bog_vk_store.swap_order(audio, prev) } catch (e: any) {
				if (e instanceof Promise) return
				console.warn('[app] baza reorder failed:', e?.message)
			}
		}

		@$mol_action
		reorder_down(audio: $bog_vk_api_audio | null) {
			if (!audio) return
			const list = this.visible_audios()
			const idx = list.findIndex((a: $bog_vk_api_audio) => a.id === audio.id && a.owner_id === audio.owner_id)
			if (idx < 0 || idx >= list.length - 1) return
			const nxt = list[idx + 1]
			try { $bog_vk_store.save_track(audio) } catch (e: any) { if (e instanceof Promise) return }
			try { $bog_vk_store.save_track(nxt) } catch (e: any) { if (e instanceof Promise) return }
			try { $bog_vk_store.swap_order(audio, nxt) } catch (e: any) {
				if (e instanceof Promise) return
				console.warn('[app] baza reorder failed:', e?.message)
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
		on_play_audio(audio?: $bog_vk_api_audio | null) {
			if (!audio) return

			const audios = this.visible_audios()
			const idx = audios.findIndex((a: $bog_vk_api_audio) => a.id === audio.id && a.owner_id === audio.owner_id)
			this.Player().queue_index(idx >= 0 ? idx : 0)
			this.Player().play_track(audio)

			// Сохраняем трек в персональный Giper Baza home land — для синка между устройствами.
			try { $bog_vk_store.save_track(audio) } catch (e: any) {
				if (e instanceof Promise) return
				console.warn('[app] baza save failed:', e?.message)
			}
		}

		@$mol_action
		clear_token() {
			this.token('')
			this.token_expired(false)
			this.token_popup_open(false)
		}

		@$mol_mem
		show_hint(next?: boolean) {
			return $mol_state_local.value('vk_show_hint', next) ?? true
		}

		/**
		 * Держим home land живым пока приложение в DOM —
		 * чтобы $giper_baza_glob не вызвал destructor() и не порвал подписки.
		 */
		auto() {
			try { $bog_vk_store.saved_audios() } catch {}
			return super.auto()
		}

		Auth_block() {
			if (this.token()) return null as any
			if (!this.show_hint()) return null as any
			return super.Auth_block()
		}

		token_hint() {
			return '1. Открой аудио (ссылка выше)\n2. F12 → Network → фильтр «api»\n3. Любой запрос → ПКМ → Copy as cURL\n4. Вставь в поле токена наверху'
		}

		Download_all() {
			if (this.offline_mode()) return null as any
			return super.Download_all()
		}

		Tabs() {
			if (this.offline_mode()) return null as any
			return super.Tabs()
		}

		Search_bar() {
			if (this.page() !== 'search') return null as any
			return super.Search_bar()
		}

		download_all() {
			const audios = this.visible_audios()
			if (!audios.length) return
			for (const audio of audios) {
				if (!audio.url) continue
				;($mol_wire_sync($bog_vk_cache) as any).save_hls(audio)
				$bog_vk_cache.version($bog_vk_cache.version() + 1)
				try { $bog_vk_store.save_track(audio) } catch (e: any) {
					if (e instanceof Promise) return
					console.warn('[app] baza save failed:', e?.message)
				}
			}
		}
	}
}
