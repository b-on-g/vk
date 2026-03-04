namespace $.$$ {
	export class $bog_vk_player extends $.$bog_vk_player {

		private _audio_el?: HTMLAudioElement

		audio_el() {
			if (this._audio_el) return this._audio_el
			const el = new Audio()
			el.volume = 0.7
			el.addEventListener('ended', () => {
				const audio = this.current_audio()
				if (audio) {
					$bog_vk_cache.save_hls(audio)
				}
				this.next()
			})
			el.addEventListener('timeupdate', () => {
				this.current_time(el.currentTime)
			})
			el.addEventListener('loadedmetadata', () => {
				this.duration(el.duration)
			})
			el.addEventListener('error', (e) => {
				console.error('[player] audio error:', el.error)
			})
			this._audio_el = el
			return el
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

		title() {
			return this.current_audio()?.title ?? ''
		}

		artist() {
			return this.current_audio()?.artist ?? ''
		}

		cover() {
			return this.current_audio()?.album?.thumb?.photo_300 ?? ''
		}

		Cover() {
			if (!this.cover()) return null as any
			return super.Cover()
		}

		Cover_placeholder() {
			if (this.cover()) return null as any
			return super.Cover_placeholder()
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
			el.pause()
			this.current_audio(audio)

			$bog_vk_cache.get(audio).then(cached_url => {
				if (cached_url) {
					console.log('[player] playing from cache:', audio.title)
					el.src = cached_url
				} else {
					el.src = audio.url
				}
				el.play().catch((e: any) => console.error('[player] play error:', e))
			})

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
