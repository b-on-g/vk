namespace $.$$ {
	export class $bog_vk_track extends $.$bog_vk_track {
		audio_data() {
			return this.audio() as $bog_vk_api_audio | null
		}

		title() {
			return this.audio_data()?.title ?? ''
		}

		artist() {
			return this.audio_data()?.artist ?? ''
		}

		cover() {
			return this.audio_data()?.album?.thumb?.photo_300 ?? ''
		}

		Cover() {
			if (!this.cover()) return null as any
			return super.Cover()
		}

		Cover_placeholder() {
			if (this.cover()) return null as any
			return super.Cover_placeholder()
		}

		duration_text() {
			const d = this.audio_data()?.duration ?? 0
			const min = Math.floor(d / 60)
			const sec = d % 60
			return `${min}:${sec.toString().padStart(2, '0')}`
		}

		@$mol_mem
		cached(next?: boolean) {
			const audio = this.audio_data()
			if (!audio) return false
			if (next !== undefined) return next
			return ($mol_wire_sync($bog_vk_cache) as any).is_cached(audio) as boolean
		}

		Download() {
			if (this.cached()) return null as any
			return super.Download()
		}

		Delete() {
			if (!this.cached()) return null as any
			return super.Delete()
		}

		event_click(event: Event) {
			try {
				if (this.Download().dom_node().contains(event.target as Node)) return
			} catch {}
			try {
				if (this.Delete().dom_node().contains(event.target as Node)) return
			} catch {}
			this.play(this.audio())
		}

		download() {
			const audio = this.audio_data()
			if (!audio) return
			;($mol_wire_sync($bog_vk_cache) as any).save_hls(audio)
			this.cached(true)
		}

		delete_cached() {
			const audio = this.audio_data()
			if (!audio) return
			;($mol_wire_sync($bog_vk_cache) as any).drop(audio)
			this.cached(false)
		}
	}
}
