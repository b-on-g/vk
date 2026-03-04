namespace $.$$ {
	export class $bog_vk_app extends $.$bog_vk_app {

		@$mol_mem
		token(next?: string) {
			if (next !== undefined) {
				this.$.$bog_vk_api.token(next)
			}
			return this.$.$bog_vk_api.token()
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
		my_audios() {
			if (!this.token()) return []
			return this.$.$bog_vk_api.my_audios()?.items ?? []
		}

		@$mol_mem
		search_results() {
			const query = this.search_query().trim()
			if (!query) return []
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

		@$mol_mem
		queue_index(next?: number) {
			return next ?? 0
		}

		@$mol_action
		on_play_audio(audio?: $bog_vk_api_audio | null) {
			if (!audio) return

			const audios = this.visible_audios()
			const idx = audios.findIndex(
				(a: $bog_vk_api_audio) => a.id === audio.id && a.owner_id === audio.owner_id
			)
			this.queue_index(idx >= 0 ? idx : 0)
			this.Player().play_track(audio)
		}

		token_hint() {
			if (this.token()) return ''
			return 'Открой vk.com → F12 → Network → фильтр «api.vk.com»\n\nВ любом запросе скопируй параметр access_token (начинается с vk1.a.)\n\nИли: Console → вставь:\nperformance.getEntriesByType("resource").filter(e=>e.name.includes("api.vk.com")).map(e=>new URL(e.name).searchParams.get("access_token")).find(Boolean)'
		}

		Token_hint() {
			if (this.token()) return null as any
			return super.Token_hint()
		}

		Search_bar() {
			if (this.page() !== 'search') return null as any
			return super.Search_bar()
		}
	}
}
