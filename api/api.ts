namespace $ {
	export class $bog_vk_api extends $mol_object {

		@$mol_mem
		static token(next?: string) {
			return $mol_state_local.value('vk_token', next) ?? ''
		}

		static async jsonp_async(method: string, params: Record<string, string | number> = {}): Promise<any> {
			const token = this.token()
			if (!token) throw new Error('Token is not set')

			const cbName = `vk_${Date.now()}_${Math.random().toString(36).slice(2)}`

			const query = new URLSearchParams({
				...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
				access_token: token,
				v: '5.131',
				callback: cbName,
			})

			return new Promise<any>((resolve, reject) => {
				const timeout = setTimeout(() => {
					delete (globalThis as any)[cbName]
					script.remove()
					reject(new Error('Request timeout'))
				}, 15000)

				;(globalThis as any)[cbName] = (data: any) => {
					clearTimeout(timeout)
					delete (globalThis as any)[cbName]
					script.remove()
					if (data.error) {
						const msg = data.error.error_msg ?? 'VK API error'
						reject(new Error(msg))
					} else {
						resolve(data.response)
					}
				}

				const script = document.createElement('script')
				script.src = `https://api.vk.com/method/${method}?${query}`
				script.onerror = () => {
					clearTimeout(timeout)
					delete (globalThis as any)[cbName]
					script.remove()
					reject(new Error('JSONP request failed'))
				}
				document.head.appendChild(script)
			})
		}

		@$mol_mem_key
		static jsonp(key: string) {
			const [method, paramsJson] = key.split('|')
			const params = JSON.parse(paramsJson)
			return ($mol_wire_sync(this) as any).jsonp_async(method, params)
		}

		@$mol_mem
		static my_audios() {
			return this.jsonp('audio.get|{"count":200}') as $bog_vk_api_audio_list
		}

		@$mol_mem_key
		static search_audios(query: string) {
			return this.jsonp(`audio.search|${JSON.stringify({ q: query, count: 100, sort: 2 })}`) as $bog_vk_api_audio_list
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
