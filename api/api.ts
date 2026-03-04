namespace $ {
	export class $bog_vk_api extends $mol_object {
		static base = 'https://api.vk.com/method/'
		static version = '5.131'

		@$mol_mem
		static token(next?: string) {
			return $mol_state_local.value('vk_token', next) ?? ''
		}

		static async call_async(url: string): Promise<any> {
			return new Promise<any>((resolve, reject) => {
				const cbName = `vk_${Date.now()}_${Math.random().toString(36).slice(2)}`

				;(globalThis as any)[cbName] = (data: any) => {
					delete (globalThis as any)[cbName]
					script.remove()
					if (data.error) reject(new Error(data.error.error_msg))
					else resolve(data.response)
				}

				const script = document.createElement('script')
				script.src = `${url}&callback=${cbName}`
				script.onerror = () => {
					delete (globalThis as any)[cbName]
					script.remove()
					reject(new Error('JSONP request failed'))
				}
				document.head.appendChild(script)
			})
		}

		@$mol_mem_key
		static call(url: string) {
			return ($mol_wire_sync(this) as any).call_async(url)
		}

		static make_url(method: string, params: Record<string, string | number> = {}) {
			const token = this.token()
			if (!token) $mol_fail(new Error('VK token is not set'))

			const query = new URLSearchParams({
				...Object.fromEntries(
					Object.entries(params).map(([k, v]) => [k, String(v)])
				),
				access_token: token,
				v: this.version,
			})

			return `${this.base}${method}?${query}`
		}

		@$mol_mem
		static my_audios() {
			const url = this.make_url('audio.get', { count: 200 })
			return this.call(url) as $bog_vk_api_audio_list
		}

		@$mol_mem_key
		static search_audios(query: string) {
			const url = this.make_url('audio.search', {
				q: query,
				count: 100,
				sort: 2,
			})
			return this.call(url) as $bog_vk_api_audio_list
		}
	}

	export interface $bog_vk_api_audio {
		id: number
		owner_id: number
		artist: string
		title: string
		duration: number
		url: string
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
