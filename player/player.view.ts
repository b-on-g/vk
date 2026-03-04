namespace $.$$ {
	export class $bog_vk_player extends $.$bog_vk_player {

		@$mol_mem
		audio_el() {
			const el = new Audio()
			el.volume = this.volume()
			el.addEventListener('ended', () => this.next())
			el.addEventListener('timeupdate', () => {
				this.current_time(el.currentTime)
			})
			el.addEventListener('loadedmetadata', () => {
				this.duration(el.duration)
			})
			return el
		}

		@$mol_mem
		current_audio(next?: $bog_vk_api_audio | null): $bog_vk_api_audio | null {
			return next ?? null
		}

		@$mol_mem
		playing(next?: boolean) {
			return next ?? false
		}

		@$mol_mem
		current_time(next?: number) {
			return next ?? 0
		}

		@$mol_mem
		duration(next?: number) {
			return next ?? 0
		}

		@$mol_mem
		volume(next?: number) {
			if (next !== undefined) {
				$mol_state_local.value('vk_volume', next)
			}
			return $mol_state_local.value('vk_volume') as number ?? 0.7
		}

		@$mol_mem
		muted(next?: boolean) {
			return next ?? false
		}

		title() {
			return this.current_audio()?.title ?? ''
		}

		artist() {
			return this.current_audio()?.artist ?? ''
		}

		cover() {
			return this.current_audio()?.album?.thumb?.photo_300 ?? ''
		}

		time_text() {
			const cur = this.current_time()
			const dur = this.duration()
			return `${this.format_time(cur)} / ${this.format_time(dur)}`
		}

		format_time(seconds: number) {
			const min = Math.floor(seconds / 60)
			const sec = Math.floor(seconds % 60)
			return `${min}:${sec.toString().padStart(2, '0')}`
		}

		progress_percent() {
			const dur = this.duration()
			if (!dur) return 0
			return (this.current_time() / dur) * 100
		}

		@$mol_action
		play_track(audio?: $bog_vk_api_audio | null) {
			if (!audio) return
			const el = this.audio_el()
			this.current_audio(audio)
			el.src = audio.url
			el.play()
			this.playing(true)
		}

		@$mol_action
		toggle() {
			const el = this.audio_el()
			if (this.playing()) {
				el.pause()
				this.playing(false)
			} else {
				el.play()
				this.playing(true)
			}
		}

		@$mol_action
		prev() {
			const queue = this.queue()
			const idx = this.queue_index()
			if (idx > 0) {
				const audio = queue[idx - 1] as $bog_vk_api_audio
				this.queue_index(idx - 1)
				this.play_track(audio)
			}
		}

		@$mol_action
		next() {
			const queue = this.queue()
			const idx = this.queue_index()
			if (idx < queue.length - 1) {
				const audio = queue[idx + 1] as $bog_vk_api_audio
				this.queue_index(idx + 1)
				this.play_track(audio)
			}
		}

		@$mol_action
		toggle_mute() {
			const el = this.audio_el()
			const muted = !this.muted()
			this.muted(muted)
			el.muted = muted
		}

		sub() {
			if (!this.current_audio()) return []
			return super.sub()
		}

		Play() {
			if (this.playing()) return null as any
			return super.Play()
		}

		Pause() {
			if (!this.playing()) return null as any
			return super.Pause()
		}

		auto() {
			const style = (this.Progress_bar().dom_node() as HTMLElement).style
			style.width = `${this.progress_percent()}%`
		}
	}
}
