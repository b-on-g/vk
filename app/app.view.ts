namespace $.$$ {
	export class $bog_vk_app extends $.$bog_vk_app {

		@$mol_mem
		token(next?: string) {
			if (next !== undefined) {
				const extracted = this.extract_token(next)
				this.$.$bog_vk_api.token(extracted)
			}
			return this.$.$bog_vk_api.token()
		}

		extract_token(input: string): string {
			const trimmed = input.trim()
			const match = trimmed.match(/vk1\.a\.[A-Za-z0-9_-]+/)
			if (match) return match[0]
			const url_match = trimmed.match(/access_token=([^&\s'"]+)/)
			if (url_match) return url_match[1]
			return trimmed
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

		@$mol_action
		on_play_audio(audio?: $bog_vk_api_audio | null) {
			if (!audio) return

			const audios = this.visible_audios()
			const idx = audios.findIndex(
				(a: $bog_vk_api_audio) => a.id === audio.id && a.owner_id === audio.owner_id
			)
			this.Player().queue_index(idx >= 0 ? idx : 0)
			this.Player().play_track(audio)
		}

		Auth_block() {
			if (this.token()) return null as any
			return super.Auth_block()
		}

		token_hint() {
			return 'Открой VK Music → F12 → Console → вставь:\nperformance.getEntriesByType("resource").filter(e=>e.name.includes("api.vk.com")).map(e=>new URL(e.name).searchParams.get("access_token")).find(Boolean)\n\nСкопируй результат и вставь в поле токена наверху'
		}

		Search_bar() {
			if (this.page() !== 'search') return null as any
			return super.Search_bar()
		}
	}
}
