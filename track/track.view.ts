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

		event_click(event: Event) {
			const target = event.target as HTMLElement
			if (target?.closest('.mol_button_minor') || target?.closest('.mol_button_typed')) return
			this.play(this.audio())
		}

		download() {
			const audio = this.audio_data()
			if (!audio) return
			$bog_vk_cache.save_hls(audio).catch(() => {})
		}
	}
}
