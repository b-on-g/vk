namespace $.$$ {
	export class $bog_vk_player extends $.$bog_vk_player {

		private _audio_el?: HTMLAudioElement
		private _queue_idx = 0

		audio_el() {
			if (this._audio_el) return this._audio_el
			const el = new Audio()
			el.volume = 0.7
			el.addEventListener('ended', () => {
				const finished = this.current_audio()
				this.next()
				if (finished) {
					$bog_vk_cache.save_hls(finished).catch(() => {})
				}
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

			if ('mediaSession' in navigator) {
				navigator.mediaSession.setActionHandler('previoustrack', () => this.prev())
				navigator.mediaSession.setActionHandler('nexttrack', () => this.next())
				navigator.mediaSession.setActionHandler('play', () => {
					el.play()
					this.playing(true)
				})
				navigator.mediaSession.setActionHandler('pause', () => {
					el.pause()
					this.playing(false)
				})
			}

			this._audio_el = el
			return el
		}

		queue_index(next?: number) {
			if (next !== undefined) this._queue_idx = next
			return this._queue_idx
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

		play_track(audio?: $bog_vk_api_audio | null) {
			if (!audio) return
			const el = this.audio_el()
			el.pause()
			this.current_audio(audio)

			if ('mediaSession' in navigator) {
				const artwork: MediaImage[] = []
				const thumb = audio.album?.thumb?.photo_300
				if (thumb) {
					artwork.push({ src: thumb, sizes: '300x300' })
				}
				navigator.mediaSession.metadata = new MediaMetadata({
					title: audio.title,
					artist: audio.artist,
					artwork,
				})
			}

			$bog_vk_cache.get(audio).then(cached_url => {
				const src = cached_url || audio.url
				if (!src) {
					console.warn('[player] no source for:', audio.artist, '—', audio.title)
					this.playing(false)
					return
				}
				el.src = src
				el.play().catch((e: any) => console.error('[player] play error:', e))
			}).catch(() => {
				if (!audio.url) {
					console.warn('[player] no source for:', audio.artist, '—', audio.title)
					this.playing(false)
					return
				}
				el.src = audio.url
				el.play().catch((e: any) => console.error('[player] play error:', e))
			})

			this.playing(true)
		}

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

		prev() {
			const queue = this.queue()
			const idx = this._queue_idx
			if (idx > 0) {
				this._queue_idx = idx - 1
				this.play_track(queue[idx - 1] as $bog_vk_api_audio)
			}
		}

		next() {
			const queue = this.queue()
			const idx = this._queue_idx
			if (idx < queue.length - 1) {
				this._queue_idx = idx + 1
				this.play_track(queue[idx + 1] as $bog_vk_api_audio)
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
