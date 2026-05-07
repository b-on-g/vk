declare const chrome: any

namespace $.$$ {
	export class $bog_vk_player extends $.$bog_vk_player {

		private _queue_idx = 0
		private _audio_el?: HTMLAudioElement
		private _last_blob_url = ''
		private _msg_listener_set = false

		private is_extension() {
			return typeof chrome !== 'undefined' && !!chrome?.runtime?.id
		}

		audio_el() {
			if ( this._audio_el ) return this._audio_el
			const el = new Audio()
			el.volume = this.volume()
			el.addEventListener( 'ended', () => {
				try {
					const finished = this.current_audio()
					this.next()
					if ( finished && navigator.onLine ) {
						$bog_vk_app.Root( 0 ).save_hls( finished ).catch( () => {} )
					}
				} catch ( e ) {
					console.warn( '[player] ended handler error:', e )
				}
			} )
			el.addEventListener( 'play', () => {
				try { this.playing( true ) } catch {}
				if ( 'mediaSession' in navigator ) navigator.mediaSession.playbackState = 'playing'
			} )
			el.addEventListener( 'pause', () => {
				try { this.playing( false ) } catch {}
				if ( 'mediaSession' in navigator ) navigator.mediaSession.playbackState = 'paused'
			} )
			el.addEventListener( 'timeupdate', () => {
				this.current_time( el.currentTime )
			} )
			el.addEventListener( 'loadedmetadata', () => {
				this.duration( el.duration )
			} )
			el.addEventListener( 'error', () => {
				console.error( '[player] audio error:', el.error?.code, el.error?.message, el.error )
			} )
			this._audio_el = el
			return el
		}

		@$mol_mem
		private offscreen_link() {
			if ( !this.is_extension() ) return null
			if ( this._msg_listener_set ) return null
			this._msg_listener_set = true

			chrome.runtime.onMessage.addListener( ( msg: any ) => {
				if ( msg?.target !== 'popup' ) return
				if ( msg.type === 'state' ) {
					if ( typeof msg.playing === 'boolean' ) {
						this.playing( msg.playing )
						if ( 'mediaSession' in navigator ) {
							navigator.mediaSession.playbackState = msg.playing ? 'playing' : 'paused'
						}
					}
					if ( typeof msg.current_time === 'number' ) this.current_time( msg.current_time )
					if ( typeof msg.duration === 'number' && isFinite( msg.duration ) ) this.duration( msg.duration )
					if ( msg.current_audio !== undefined ) this.current_audio( msg.current_audio )
				}
				if ( msg.type === 'ended' ) {
					try {
						const finished = this.current_audio()
						this.next()
						if ( finished && navigator.onLine ) {
							$bog_vk_app.Root( 0 ).save_hls( finished ).catch( () => {} )
						}
					} catch ( e ) {
						console.warn( '[player] ended handler error:', e )
					}
				}
				if ( msg.type === 'error' ) {
					console.error( '[player] offscreen error:', msg.code, msg.message )
				}
			} )

			chrome.runtime.sendMessage( { target: 'background', type: 'ensure_offscreen' } )
				.then( () => chrome.runtime.sendMessage( { target: 'offscreen', type: 'get_state' } ) )
				.then( ( s: any ) => {
					if ( s?.current_audio ) {
						if ( typeof s.playing === 'boolean' ) this.playing( s.playing )
						if ( typeof s.current_time === 'number' ) this.current_time( s.current_time )
						if ( typeof s.duration === 'number' && isFinite( s.duration ) ) this.duration( s.duration )
						this.current_audio( s.current_audio )
						return
					}
					this.try_restore_session()
				} )
				.catch( () => {} )

			return null
		}

		private _session_restored = false

		private async try_restore_session() {
			if ( this._session_restored ) return
			this._session_restored = true
			const app = $bog_vk_app.Root( 0 )
			let session: { audio: $bog_vk_api_audio, position: number } | null = null
			try {
				session = await ( $mol_wire_async( app ) as any ).last_session() as any
			} catch ( e: any ) {
				console.warn( '[player] restore_session read failed:', e?.message )
				return
			}
			if ( !session ) return
			this.current_audio( session.audio )
			this.current_time( session.position )
			if ( session.audio.duration ) this.duration( session.audio.duration )

			if ( this.is_extension() ) {
				this.dispatch_restore_offscreen( session.audio, session.position ).catch( () => {} )
			} else {
				const el = this.audio_el()
				this.load_local_paused( session.audio, session.position, el ).catch( () => {} )
			}
		}

		private async dispatch_restore_offscreen( audio: $bog_vk_api_audio, position: number ) {
			try {
				await chrome.runtime.sendMessage( { target: 'background', type: 'ensure_offscreen' } )
				const app = $bog_vk_app.Root( 0 )
				let blob: Blob | null = null
				try {
					blob = await ( $mol_wire_async( app ) as any ).local_blob( audio ) as Blob | null
				} catch {}
				if ( !blob && audio.url ) {
					try {
						await app.save_hls( audio )
						blob = app.local_blob( audio ) as Blob | null
					} catch ( e: any ) {
						console.error( '[player] restore save_hls failed:', e?.message )
					}
				}
				if ( blob ) {
					const buffer = await blob.arrayBuffer()
					await chrome.runtime.sendMessage( {
						target: 'offscreen',
						type: 'play_track',
						audio,
						buffer,
						mime: blob.type || 'audio/mpeg',
						start_at: position,
						autoplay: false,
					} )
				}
			} catch ( e: any ) {
				console.error( '[player] restore offscreen failed:', e )
			}
		}

		private async load_local_paused( audio: $bog_vk_api_audio, position: number, el: HTMLAudioElement ) {
			try {
				const app = $bog_vk_app.Root( 0 )
				let blob: Blob | null = null
				try {
					blob = await ( $mol_wire_async( app ) as any ).local_blob( audio ) as Blob | null
				} catch {}
				if ( blob ) {
					if ( this._last_blob_url ) URL.revokeObjectURL( this._last_blob_url )
					const url = URL.createObjectURL( blob )
					this._last_blob_url = url
					el.src = url
				} else if ( audio.url ) {
					el.src = audio.url
				} else {
					return
				}
				const seek = () => {
					try { el.currentTime = position } catch {}
					el.removeEventListener( 'loadedmetadata', seek )
				}
				el.addEventListener( 'loadedmetadata', seek )
			} catch ( e: any ) {
				console.error( '[player] local restore failed:', e )
			}
		}

		private setup_media_session() {
			if ( !( 'mediaSession' in navigator ) ) return
			const ms = navigator.mediaSession
			ms.setActionHandler( 'previoustrack', () => { try { this.prev() } catch {} } )
			ms.setActionHandler( 'nexttrack', () => { try { this.next() } catch {} } )
			if ( this.is_extension() ) {
				ms.setActionHandler( 'seekto', ( details ) => {
					if ( details.seekTime != null ) this.send( 'seek', { time: details.seekTime } )
				} )
				ms.setActionHandler( 'play', () => { this.send( 'resume' ) } )
				ms.setActionHandler( 'pause', () => { this.send( 'pause' ) } )
			} else {
				const el = this.audio_el()
				ms.setActionHandler( 'seekto', ( details ) => {
					if ( details.seekTime != null ) el.currentTime = details.seekTime
				} )
				ms.setActionHandler( 'play', () => { el.play().catch( () => {} ) } )
				ms.setActionHandler( 'pause', () => { el.pause() } )
			}
		}

		private send( type: string, payload?: Record< string, unknown > ) {
			if ( !this.is_extension() ) return
			chrome.runtime.sendMessage( { target: 'offscreen', type, ...payload } ).catch( () => {} )
		}

		queue_index( next?: number ) {
			if ( next !== undefined ) this._queue_idx = next
			return this._queue_idx
		}

		@$mol_mem
		playing( next?: boolean ) {
			return next ?? false
		}

		@$mol_mem
		current_time( next?: number ) {
			return next ?? 0
		}

		@$mol_mem
		duration( next?: number ) {
			return next ?? 0
		}

		@$mol_mem
		volume( next?: number ) {
			const v = $mol_state_local.value( 'bog_vk_volume', next ) ?? 0.7
			return Math.max( 0, Math.min( 1, v as number ) )
		}

		private _vol_dragging = false

		private volume_set_from_event( event: PointerEvent ) {
			const target = event.currentTarget as HTMLElement
			const rect = target.getBoundingClientRect()
			const y = event.clientY - rect.top
			const v = Math.max( 0, Math.min( 1, 1 - y / rect.height ) )
			this.volume( v )
		}

		volume_pointer_down( event?: Event ) {
			if ( !event ) return null
			const e = event as PointerEvent
			const target = e.currentTarget as HTMLElement
			try { target.setPointerCapture( e.pointerId ) } catch {}
			this._vol_dragging = true
			this.volume_set_from_event( e )
			e.preventDefault()
			return null
		}

		volume_pointer_move( event?: Event ) {
			if ( !event || !this._vol_dragging ) return null
			this.volume_set_from_event( event as PointerEvent )
			return null
		}

		volume_pointer_up( event?: Event ) {
			if ( !event ) return null
			const e = event as PointerEvent
			const target = e.currentTarget as HTMLElement
			try { target.releasePointerCapture( e.pointerId ) } catch {}
			this._vol_dragging = false
			try { this.Volume().hovered( false ) } catch {}
			return null
		}

		volume_fill_height() {
			return `${ Math.round( this.volume() * 100 ) }%`
		}

		@$mol_mem
		private apply_volume() {
			const v = this.volume()
			if ( this.is_extension() ) {
				this.send( 'volume', { value: v } )
			} else if ( this._audio_el ) {
				this._audio_el.volume = v
			}
			return v
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
			if ( !this.cover() ) return null as any
			return super.Cover()
		}

		Cover_placeholder() {
			if ( this.cover() ) return null as any
			return super.Cover_placeholder()
		}

		time_current_text() {
			return this.format_time( this.current_time() )
		}

		time_total_text() {
			return this.format_time( this.duration() )
		}

		format_time( seconds: number ) {
			const min = Math.floor( seconds / 60 )
			const sec = Math.floor( seconds % 60 )
			return `${min}:${sec.toString().padStart( 2, '0' )}`
		}

		progress_percent() {
			const dur = this.duration()
			if ( !dur ) return 0
			return ( this.current_time() / dur ) * 100
		}

		play_track( audio?: $bog_vk_api_audio | null ) {
			if ( !audio ) return
			this.current_audio( audio )
			try { $bog_vk_app.Root( 0 ).save_last_session( audio, 0 ) } catch {}

			if ( 'mediaSession' in navigator ) {
				const artwork: MediaImage[] = []
				const thumb = audio.album?.thumb?.photo_300
				if ( thumb ) artwork.push( { src: thumb, sizes: '300x300' } )
				navigator.mediaSession.metadata = new MediaMetadata( {
					title: audio.title,
					artist: audio.artist,
					artwork,
				} )
				this.setup_media_session()
			}

			if ( this.is_extension() ) {
				this.dispatch_play_offscreen( audio )
			} else {
				const el = this.audio_el()
				if ( audio.url ) {
					el.src = audio.url
					el.play().catch( () => {} )
				}
				this.play_source_local( audio, el )
			}
		}

		private async dispatch_play_offscreen( audio: $bog_vk_api_audio ) {
			try {
				await chrome.runtime.sendMessage( { target: 'background', type: 'ensure_offscreen' } )

				const app = $bog_vk_app.Root( 0 )

				let blob: Blob | null = null
				try {
					blob = await ( $mol_wire_async( app ) as any ).local_blob( audio ) as Blob | null
				} catch {}

				if ( !blob && audio.url ) {
					try {
						await app.save_hls( audio )
						blob = app.local_blob( audio ) as Blob | null
					} catch ( e: any ) {
						console.error( '[player] save_hls failed:', e?.message )
					}
				}

				if ( blob ) {
					const buffer = await blob.arrayBuffer()
					await chrome.runtime.sendMessage( {
						target: 'offscreen',
						type: 'play_track',
						audio,
						buffer,
						mime: blob.type || 'audio/mpeg',
					} )
					return
				}

				console.warn( '[player] no source:', audio.artist, '—', audio.title )
			} catch ( e: any ) {
				console.error( '[player] play failed:', e )
				this.playing( false )
			}
		}

		private async play_source_local( audio: $bog_vk_api_audio, el: HTMLAudioElement ) {
			try {
				if ( this._last_blob_url ) {
					URL.revokeObjectURL( this._last_blob_url )
					this._last_blob_url = ''
				}

				const app = $bog_vk_app.Root( 0 )

				const blob = await ( $mol_wire_async( app ) as any ).local_blob( audio ) as Blob | null
				if ( blob ) {
					const url = URL.createObjectURL( blob )
					this._last_blob_url = url
					el.src = url
					await this.safe_play( el )
					return
				}

				if ( audio.url ) {
					el.src = audio.url
					try {
						await this.safe_play( el )
						app.save_hls( audio ).catch( () => {} )
						return
					} catch {}
				}

				if ( audio.url ) {
					await app.save_hls( audio )
					const blob2 = app.local_blob( audio )
					if ( blob2 ) {
						const url = URL.createObjectURL( blob2 )
						this._last_blob_url = url
						el.src = url
						await this.safe_play( el )
						return
					}
				}

				console.warn( '[player] no source:', audio.artist, '—', audio.title )
			} catch ( e: any ) {
				console.error( '[player] play failed:', e )
			}
			this.playing( false )
		}

		private async safe_play( el: HTMLAudioElement ) {
			try {
				await el.play()
			} catch ( e: any ) {
				if ( e?.name === 'NotAllowedError' ) {
					console.warn( '[player] play blocked, will resume on user interaction' )
					el.muted = true
					try { await el.play() } catch {}
					el.muted = false
				} else {
					throw e
				}
			}
		}

		toggle() {
			const was_playing = this.playing()
			if ( this.is_extension() ) {
				if ( was_playing ) this.send( 'pause' )
				else this.send( 'resume' )
			} else {
				const el = this.audio_el()
				if ( was_playing ) el.pause()
				else el.play()
			}
			if ( was_playing ) {
				const audio = this.current_audio()
				if ( audio ) {
					try { $bog_vk_app.Root( 0 ).save_last_session( audio, this.current_time() ) } catch {}
				}
			}
		}

		prev() {
			const queue = this.queue()
			const idx = this._queue_idx
			if ( idx > 0 ) {
				this._queue_idx = idx - 1
				this.play_track( queue[ idx - 1 ] as $bog_vk_api_audio )
			}
		}

		next() {
			try {
				const picked = this.pick_next( this.current_audio() ) as $bog_vk_api_audio | null
				if ( picked ) {
					const queue = this.queue()
					const idx = queue.findIndex( ( a: $bog_vk_api_audio ) => a.id === picked.id && a.owner_id === picked.owner_id )
					if ( idx >= 0 ) this._queue_idx = idx
					this.play_track( picked )
					return
				}
			} catch ( e: any ) {
				if ( e instanceof Promise ) throw e
				console.warn( '[player] pick_next failed:', e?.message )
			}
			const queue = this.queue()
			if ( !queue.length ) return
			const next_idx = this._queue_idx + 1 < queue.length ? this._queue_idx + 1 : 0
			this._queue_idx = next_idx
			this.play_track( queue[ next_idx ] as $bog_vk_api_audio )
		}

		sub() {
			if ( !this.current_audio() ) return []
			return super.sub()
		}

		Play() {
			if ( this.playing() ) return null as any
			return super.Play()
		}

		Pause() {
			if ( !this.playing() ) return null as any
			return super.Pause()
		}

		private _pagehide_listener_set = false

		private setup_pagehide_save() {
			if ( this._pagehide_listener_set ) return
			this._pagehide_listener_set = true
			window.addEventListener( 'pagehide', () => {
				const audio = this.current_audio()
				if ( !audio ) return
				try { $bog_vk_app.Root( 0 ).save_last_session( audio, this.current_time() ) } catch {}
			} )
		}

		auto() {
			this.offscreen_link()
			this.setup_pagehide_save()
			if ( !this.is_extension() && !this.current_audio() ) {
				this.try_restore_session()
			}
			this.apply_volume()
			const style = ( this.Progress_bar().dom_node() as HTMLElement ).style
			style.width = `${this.progress_percent()}%`
		}
	}
}

