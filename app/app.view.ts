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

		title() {
			const statuses: string[] = []
			if (!this.online()) statuses.push('offline')
			if (this.token_invalid()) statuses.push('невалидный токен')
			else if (this.token_expired()) statuses.push('токен протух')
			if (statuses.length) return `Bog Music (${statuses.join(', ')})`
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

		@$mol_mem
		cached_audios(): $bog_vk_api_audio[] {
			return ($mol_wire_sync($bog_vk_cache) as any).all_cached()
		}

		@$mol_mem
		my_audios() {
			if (!this.token()) return this.cached_audios()
			if (this.token_invalid()) return this.cached_audios()
			if (!this.online()) return this.cached_audios()
			try {
				const result = this.$.$bog_vk_api.my_audios()?.items ?? []
				setTimeout(() => this.token_expired(false), 0)
				return result
			} catch (e: any) {
				if (e instanceof Promise || e?.constructor?.name === '$mol_fail_hidden') throw e
				const msg = String(e?.message)
				if (msg.includes('expired') || msg.includes('authorization') || msg.includes('User authorization failed')) {
					setTimeout(() => {
						this.token_expired(true)
						this.online(false)
					}, 0)
				}
				console.warn('[app] API failed, using cache:', msg)
				return this.cached_audios()
			}
		}

		@$mol_mem
		search_results() {
			const query = this.search_query().trim()
			if (!query) return []
			if (!this.online()) return []
			return this.$.$bog_vk_api.search_audios(query)?.items ?? []
		}

		@$mol_mem
		visible_audios() {
			if (this.page() === 'search' && this.search_query().trim()) {
				return this.search_results()
			}
			return this.my_audios()
		}

		@$mol_mem
		current_audio(next?: $bog_vk_api_audio | null): $bog_vk_api_audio | null {
			return next ?? null
		}

		@$mol_action
		on_play_audio(audio?: $bog_vk_api_audio | null) {
			if (!audio) return

			const audios = this.visible_audios()
			const idx = audios.findIndex((a: $bog_vk_api_audio) => a.id === audio.id && a.owner_id === audio.owner_id)
			this.Player().queue_index(idx >= 0 ? idx : 0)
			this.Player().play_track(audio)
		}

		Token_clear() {
			if (!this.token()) return null as any
			return super.Token_clear()
		}

		@$mol_action
		clear_token() {
			this.token('')
			this.token_expired(false)
		}

		Auth_block() {
			if (this.token()) return null as any
			return super.Auth_block()
		}

		token_hint() {
			return '1. Открой аудио (ссылка выше)\n2. F12 → Network → фильтр «api»\n3. Любой запрос → ПКМ → Copy as cURL\n4. Вставь в поле токена наверху'
		}

		download_all() {
			const audios = this.visible_audios()
			if (!audios.length) return
			console.log(`[app] downloading all ${audios.length} tracks...`)
			const download_next = async (i: number) => {
				if (i >= audios.length) {
					console.log('[app] all downloads complete')
					return
				}
				await $bog_vk_cache.save_hls(audios[i])
				await download_next(i + 1)
			}
			download_next(0).catch(e => console.warn('[app] download all error:', e))
		}

		Search_bar() {
			if (this.page() !== 'search') return null as any
			return super.Search_bar()
		}
	}
}
