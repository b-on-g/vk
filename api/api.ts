namespace $ {
	export class $bog_vk_api extends $mol_object {

		static default_proxy_url = 'https://bog-vk-audio.cmyser-fast-i.workers.dev'

		@$mol_mem
		static token(next?: string) {
			return $mol_state_local.value('vk_token', next) ?? ''
		}

		@$mol_mem
		static cookies(next?: string) {
			return $mol_state_local.value('vk_cookies', next) ?? ''
		}

		/**
		 * Конфигурируемый URL прокси. Пустое значение — дефолт.
		 * Позволяет обходить блокировки VK API через свой / альтернативный хост.
		 */
		@$mol_mem
		static proxy_url(next?: string) {
			const custom = $mol_state_local.value('vk_proxy_url', next) ?? ''
			return custom || this.default_proxy_url
		}

		static async fetch_proxy(endpoint: string, body: Record<string, any>): Promise<any> {
			const base = this.proxy_url().replace(/\/$/, '')
			const resp = await fetch(`${base}${endpoint}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})

			const data = await resp.json()

			if (!resp.ok) {
				const code = (data as any).code ?? '?'
				const msg = (data as any).error ?? 'Proxy error'
				console.error(`[vk-api] error ${code}: ${msg}`)
				throw new Error(`[${code}] ${msg}`)
			}

			return data
		}

		@$mol_mem
		static my_audios() {
			const token = this.token()
			if (!token) throw new Error('Token is not set')
			return ($mol_wire_sync(this) as any).fetch_proxy('/audios', { token, cookies: this.cookies(), count: 200 }) as $bog_vk_api_audio_list
		}

		@$mol_mem_key
		static search_audios(query: string) {
			const token = this.token()
			if (!token) throw new Error('Token is not set')
			return ($mol_wire_sync(this) as any).fetch_proxy('/search', { token, cookies: this.cookies(), query, count: 100 }) as $bog_vk_api_audio_list
		}
	}

	export interface $bog_vk_api_audio {
		id: number
		owner_id: number
		artist: string
		title: string
		duration: number
		url: string
		access_key?: string
		album?: {
			id: number
			title: string
			thumb?: {
				photo_300?: string
				photo_600?: string
			}
		}
	}

	export interface $bog_vk_api_audio_list {
		count: number
		items: $bog_vk_api_audio[]
	}
}
