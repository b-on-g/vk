namespace $ {
	export class $bog_vk_api extends $mol_object {
		static worker = 'https://bog-vk-audio.cmyser-fast-i.workers.dev'

		@$mol_mem
		static token(next?: string) {
			return $mol_state_local.value('vk_remixsid', next) ?? ''
		}

		static async post_async(endpoint: string, body: Record<string, any>): Promise<any> {
			const response = await fetch(`${this.worker}${endpoint}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ remixsid: this.token(), ...body }),
			})
			const data = await response.json() as any
			if (data.error) throw new Error(data.error)
			return data
		}

		@$mol_mem_key
		static post(key: string) {
			const [endpoint, bodyJson] = key.split('|')
			const body = JSON.parse(bodyJson)
			return ($mol_wire_sync(this) as any).post_async(endpoint, body)
		}

		@$mol_mem
		static my_audios() {
			return this.post('/audios|{}') as $bog_vk_api_audio_list
		}

		@$mol_mem_key
		static search_audios(query: string) {
			return this.post(`/search|${JSON.stringify({ query })}`) as $bog_vk_api_audio_list
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
