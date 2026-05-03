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

		/**
		 * Запущены ли мы как Chrome/Firefox extension popup?
		 * В этом контексте host_permissions снимают CORS, и VK API можно дёргать
		 * напрямую без прокси-воркера.
		 */
		static in_extension(): boolean {
			try {
				const proto = location.protocol
				return proto === 'chrome-extension:' || proto === 'moz-extension:'
			} catch {
				return false
			}
		}

		/** Прямой вызов VK API из popup (использует host_permissions расширения). */
		static async fetch_vk_direct(method: string, params: Record<string, any>): Promise<any> {
			const token = this.token()
			if (!token) throw new Error('Token is not set')
			const body = new URLSearchParams({
				...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
				access_token: token,
				v: '5.275',
				client_id: '6287487',
			})
			// credentials: 'include' прицепляет cookies vk.com (если user залогинен) —
			// нужно для приватных треков с непустым audio.url.
			const resp = await fetch(`https://api.vk.com/method/${method}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body.toString(),
				credentials: 'include',
			})
			const data = await resp.json() as any
			if (data?.error) {
				const msg = data.error.error_msg ?? 'VK API error'
				const code = data.error.error_code ?? '?'
				console.error(`[vk-api] error ${code}: ${msg}`)
				throw new Error(`[${code}] ${msg}`)
			}
			return data.response
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
			if (this.in_extension()) {
				return ($mol_wire_sync(this) as any).fetch_vk_direct('audio.get', { count: 200 }) as $bog_vk_api_audio_list
			}
			return ($mol_wire_sync(this) as any).fetch_proxy('/audios', { token, cookies: this.cookies(), count: 200 }) as $bog_vk_api_audio_list
		}

		@$mol_mem_key
		static search_audios(query: string) {
			const token = this.token()
			if (!token) throw new Error('Token is not set')
			if (this.in_extension()) {
				return ($mol_wire_sync(this) as any).fetch_vk_direct('audio.search', { q: query, count: 100, sort: 2 }) as $bog_vk_api_audio_list
			}
			return ($mol_wire_sync(this) as any).fetch_proxy('/search', { token, cookies: this.cookies(), query, count: 100 }) as $bog_vk_api_audio_list
		}

		/**
		 * Обновляет URL трека (HLS-ссылки от VK живут ~60 минут).
		 * Используется перед save_hls для треков, у которых url протух.
		 */
		@$mol_mem_key
		static refresh_audio(audio_key: string): $bog_vk_api_audio | null {
			const token = this.token()
			if (!token) throw new Error('Token is not set')
			if (this.in_extension()) {
				const resp = ($mol_wire_sync(this) as any).fetch_vk_direct('audio.getById', { audios: audio_key }) as $bog_vk_api_audio[]
				return resp?.[0] ?? null
			}
			const resp = ($mol_wire_sync(this) as any).fetch_proxy('/getById', { token, cookies: this.cookies(), audios: audio_key }) as $bog_vk_api_audio[]
			return resp?.[0] ?? null
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
