namespace $.$$ {
	export class $bog_vk_player extends $.$bog_vk_player {

		private _audio_el?: HTMLAudioElement
		private _queue_idx = 0

		audio_el() {
			if (this._audio_el) return this._audio_el
			const el = new Audio()
			el.volume = 0.7
			el.addEventListener('ended', () => {
				try {
					const finished = this.current_audio()
					this.next()
					if (finished && navigator.onLine) {
						$bog_vk_cache.save_hls(finished).catch(() => {})
					}
				} catch (e) {
					console.warn('[player] ended handler error:', e)
				}
			})
			el.addEventListener('timeupdate', () => {
				this.current_time(el.currentTime)
			})
			el.addEventListener('loadedmetadata', () => {
				this.duration(el.duration)
			})
			el.addEventListener('error', (e) => {
				console.error('[player] audio error:', el.error?.code, el.error?.message, el.error)
			})
			this._audio_el = el
			return el
		}

		private setup_media_session() {
			if (!('mediaSession' in navigator)) return
			const el = this.audio_el()
			const ms = navigator.mediaSession
			ms.setActionHandler('previoustrack', () => this.prev())
			ms.setActionHandler('nexttrack', () => this.next())
			ms.setActionHandler('seekto', (details) => {
				if (details.seekTime != null) el.currentTime = details.seekTime
			})
			ms.setActionHandler('play', () => { el.play(); this.playing(true); ms.playbackState = 'playing' })
			ms.setActionHandler('pause', () => { el.pause(); this.playing(false); ms.playbackState = 'paused' })
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
				this.setup_media_session()
			}

			this.play_source(audio, el)
		}

		private async play_source(audio: $bog_vk_api_audio, el: HTMLAudioElement) {
			try {
				// 1. Try cache (has actual audio data, works offline)
				const cached = await $bog_vk_cache.get(audio)
				if (cached) {
					el.src = cached
					await el.play()
					this.playing(true)
					if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
					return
				}

				// 2. Try direct URL (Safari supports HLS natively)
				if (audio.url) {
					el.src = audio.url
					try {
						await el.play()
						this.playing(true)
						if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
						$bog_vk_cache.save_hls(audio).catch(() => {})
						return
					} catch {
						// Direct play failed — download first
					}
				}

				// 3. Download HLS → cache → play
				if (audio.url) {
					await $bog_vk_cache.save_hls(audio)
					const url = await $bog_vk_cache.get(audio)
					if (url) {
						el.src = url
						await el.play()
						this.playing(true)
						if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
						return
					}
				}

				console.warn('[player] no source:', audio.artist, '—', audio.title)
			} catch (e: any) {
				console.error('[player] play failed:', e)
			}
			this.playing(false)
		}

		toggle() {
			const el = this.audio_el()
			if (this.playing()) {
				el.pause()
				this.playing(false)
				if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
			} else {
				el.play()
				this.playing(true)
				if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
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
			if (!queue.length) return
			const next_idx = this._queue_idx + 1 < queue.length ? this._queue_idx + 1 : 0
			this._queue_idx = next_idx
			this.play_track(queue[next_idx] as $bog_vk_api_audio)
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
