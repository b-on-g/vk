declare const chrome: any

namespace $.$$ {
	export class $bog_vk_player extends $.$bog_vk_player {

		private _queue_idx = 0
		private _audio_el?: HTMLAudioElement
		private _last_blob_url = ''
		private _msg_listener_set = false
		private _channel?: BroadcastChannel

		private is_extension() {
			return typeof chrome !== 'undefined' && !!chrome?.runtime?.id
		}

		// chrome.runtime.sendMessage сериализует payload через JSON — Blob/ArrayBuffer
		// приходят в offscreen как пустой `{}`, аудио-демуксер падает с
		// DEMUXER_ERROR_COULD_NOT_OPEN. Поэтому play_track (с blob'ом) гоняем
		// через BroadcastChannel: он использует structured clone и сохраняет Blob.
		private channel() {
			if ( !this._channel ) this._channel = new BroadcastChannel( 'bog_vk_player' )
			return this._channel
		}

		audio_el() {
			if ( this._audio_el ) return this._audio_el
			const el = new Audio()
			el.volume = this.volume()
			el.loop = this.repeat_mode() === 'one'
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
					this.channel().postMessage( {
						target: 'offscreen',
						type: 'play_track',
						audio,
						blob,
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
		repeat_mode( next?: 'all' | 'one' | 'shuffle' ) {
			const v = $mol_state_local.value( 'bog_vk_repeat_mode', next ) as string | null
			if ( v === 'one' || v === 'shuffle' ) return v
			return 'all' as const
		}

		repeat_cycle() {
			const cur = this.repeat_mode()
			const order: ( 'all' | 'one' | 'shuffle' )[] = [ 'all', 'one', 'shuffle' ]
			const idx = order.indexOf( cur as any )
			const next = order[ ( idx + 1 ) % order.length ]
			this.repeat_mode( next )
		}

		repeat_hint() {
			const m = this.repeat_mode()
			if ( m === 'one' ) return 'Повтор одного трека'
			if ( m === 'shuffle' ) return 'Случайный порядок'
			return 'Повтор плейлиста'
		}

		Repeat_all_icon() {
			if ( this.repeat_mode() !== 'all' ) return null as any
			return super.Repeat_all_icon()
		}

		Repeat_one_icon() {
			if ( this.repeat_mode() !== 'one' ) return null as any
			return super.Repeat_one_icon()
		}

		Shuffle_icon() {
			if ( this.repeat_mode() !== 'shuffle' ) return null as any
			return super.Shuffle_icon()
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

		@$mol_mem
		private apply_loop() {
			const loop = this.repeat_mode() === 'one'
			if ( this.is_extension() ) {
				this.send( 'loop', { value: loop } )
			} else if ( this._audio_el ) {
				this._audio_el.loop = loop
			}
			return loop
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
			// КРИТИЧНО: сбрасываем current_time/duration ДО смены current_audio.
			// Иначе apply_trim в auto(), отреагировав на смену current_audio,
			// прочитает stale значения от предыдущего трека (например t=200, dur=240),
			// и если у нового трека сохранён trim_end < 200 — моментально дёрнет next()
			// → каскад play_track-сообщений → src перезаписывается до loadedmetadata.
			this.current_time( 0 )
			this.duration( 0 )
			this.current_audio( audio )
			this._trim_end_skip = ''
			const start_at = $bog_vk_app.Root( 0 ).trim_start( audio )
			try { $bog_vk_app.Root( 0 ).save_last_session( audio, start_at ) } catch {}

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
				this.dispatch_play_offscreen( audio, start_at )
			} else {
				const el = this.audio_el()
				// iOS PWA: при заблокированном экране любой await перед el.play()
				// рвёт audio-session continuation от `ended`-обработчика — трек
				// идёт молча. Пробуем СИНХРОННО взять blob (в типичном случае он
				// в baza уже есть) и сразу же src+play в том же tick.
				if ( this.try_play_local_sync( audio, el, start_at ) ) return
				if ( audio.url ) {
					this.attach_seek_listener( el, start_at )
					el.src = audio.url
					el.play().catch( () => {} )
				}
				this.play_source_local( audio, el, start_at )
			}
		}

		private try_play_local_sync( audio: $bog_vk_api_audio, el: HTMLAudioElement, start_at: number ): boolean {
			let blob: Blob | null = null
			try {
				blob = $bog_vk_app.Root( 0 ).local_blob( audio )
			} catch ( e: any ) {
				if ( e instanceof Promise ) return false
				return false
			}
			if ( !blob ) return false
			if ( this._last_blob_url ) URL.revokeObjectURL( this._last_blob_url )
			const url = URL.createObjectURL( blob )
			this._last_blob_url = url
			this._dispatch_token++
			this.attach_seek_listener( el, start_at )
			el.src = url
			el.play().catch( () => {} )
			return true
		}

		private attach_seek_listener( el: HTMLAudioElement, start_at: number ) {
			if ( start_at <= 0 ) return
			const seek = () => {
				try { el.currentTime = start_at } catch {}
				el.removeEventListener( 'loadedmetadata', seek )
			}
			el.addEventListener( 'loadedmetadata', seek )
		}

		private seek_to( time: number ) {
			if ( this.is_extension() ) {
				this.send( 'seek', { time } )
			} else if ( this._audio_el ) {
				try { this._audio_el.currentTime = time } catch {}
			}
		}

		/**
		 * Реактивный apply ТОЛЬКО end-trim'а. Вызывается из auto() —
		 * подписывается на current_audio / current_time / duration / Trim_end.
		 * При current_time >= trim_end → next() (через microtask, чтобы не
		 * писать в cell внутри auto-фибры).
		 *
		 * Start-trim seek НЕ делается реактивно из auto: drag handle спамит
		 * save_trim_start → каждое сохранение invalidate'ит подписку на atom →
		 * apply_trim передёргивается → seek_to → chrome.runtime.sendMessage('seek')
		 * в offscreen. Десятки seek-сообщений в гонке с pending play_track msg
		 * рвут audio.src → DEMUXER_ERROR. Поэтому seek на trim_start выполняется
		 * один раз — в trim_pointer_up.
		 */
		private apply_trim() {
			const audio = this.current_audio()
			if ( !audio ) return
			const dur = this.duration()
			if ( !dur ) return
			const te = $bog_vk_app.Root( 0 ).trim_end( audio, dur )
			if ( te >= dur ) return
			if ( this.current_time() < te ) return

			const key = `${audio.owner_id}_${audio.id}`
			if ( this._trim_end_skip === key ) return
			this._trim_end_skip = key
			queueMicrotask( () => {
				try {
					this.next()
					if ( navigator.onLine ) $bog_vk_app.Root( 0 ).save_hls( audio ).catch( () => {} )
				} catch ( e: any ) {
					if ( e instanceof Promise ) return
					console.warn( '[player] trim_end next failed:', e?.message )
				}
			} )
		}

		private _trim_end_skip = ''

		// ---------- trim handles ----------

		private _trim_drag: 'start' | 'end' | null = null

		private trim_apply( event: PointerEvent ) {
			const audio = this.current_audio()
			if ( !audio ) return
			const dur = this.duration()
			if ( !dur ) return
			const progress = this.Progress().dom_node() as HTMLElement
			const rect = progress.getBoundingClientRect()
			const x = event.clientX - rect.left
			const pct = Math.max( 0, Math.min( 1, x / rect.width ) )
			let seconds = pct * dur
			const app = $bog_vk_app.Root( 0 )
			if ( this._trim_drag === 'start' ) {
				const end = app.trim_end( audio, dur )
				seconds = Math.min( seconds, Math.max( 0, end - 1 ) )
				app.save_trim_start( audio, seconds )
			} else if ( this._trim_drag === 'end' ) {
				const start = app.trim_start( audio )
				seconds = Math.max( seconds, Math.min( dur, start + 1 ) )
				app.save_trim_end( audio, seconds )
			}
		}

		trim_start_pointer_down( event?: Event ) {
			if ( !event ) return null
			const e = event as PointerEvent
			e.stopPropagation()
			e.preventDefault()
			try { ( e.currentTarget as HTMLElement ).setPointerCapture( e.pointerId ) } catch {}
			this._trim_drag = 'start'
			this.trim_apply( e )
			return null
		}

		trim_start_pointer_move( event?: Event ) {
			if ( !event || this._trim_drag !== 'start' ) return null
			this.trim_apply( event as PointerEvent )
			return null
		}

		trim_end_pointer_down( event?: Event ) {
			if ( !event ) return null
			const e = event as PointerEvent
			e.stopPropagation()
			e.preventDefault()
			try { ( e.currentTarget as HTMLElement ).setPointerCapture( e.pointerId ) } catch {}
			this._trim_drag = 'end'
			this.trim_apply( e )
			return null
		}

		trim_end_pointer_move( event?: Event ) {
			if ( !event || this._trim_drag !== 'end' ) return null
			this.trim_apply( event as PointerEvent )
			return null
		}

		trim_pointer_up( event?: Event ) {
			if ( !event ) return null
			const e = event as PointerEvent
			try { ( e.currentTarget as HTMLElement ).releasePointerCapture( e.pointerId ) } catch {}
			const drag = this._trim_drag
			this._trim_drag = null
			// Единичный seek после отпускания start-handle.
			if ( drag === 'start' ) {
				const audio = this.current_audio()
				if ( audio ) {
					const ts = $bog_vk_app.Root( 0 ).trim_start( audio )
					if ( ts > 0 && this.current_time() < ts - 0.5 ) {
						this.seek_to( ts )
					}
				}
			}
			return null
		}

		trim_start_left() {
			const audio = this.current_audio()
			const dur = this.duration()
			if ( !audio || !dur ) return '0%'
			return `${ ( $bog_vk_app.Root( 0 ).trim_start( audio ) / dur ) * 100 }%`
		}

		trim_end_left() {
			const audio = this.current_audio()
			const dur = this.duration()
			if ( !audio || !dur ) return '100%'
			return `${ ( $bog_vk_app.Root( 0 ).trim_end( audio, dur ) / dur ) * 100 }%`
		}

		private _dispatch_token = 0

		private is_current( audio: $bog_vk_api_audio ): boolean {
			const cur = this.current_audio()
			return !!cur && cur.id === audio.id && cur.owner_id === audio.owner_id
		}

		private async dispatch_play_offscreen( audio: $bog_vk_api_audio, start_at: number = 0 ) {
			// Fast-clicks: пока local_blob/save_hls для трека A грузится через wire_async,
			// пользователь кликает B. Без токена оба dispatch'а долетают до postMessage,
			// порядок прибытия в offscreen неопределён → инфа от B, аудио от A.
			const token = ++this._dispatch_token
			try {
				await chrome.runtime.sendMessage( { target: 'background', type: 'ensure_offscreen' } )
				if ( token !== this._dispatch_token || !this.is_current( audio ) ) return

				const app = $bog_vk_app.Root( 0 )

				let blob: Blob | null = null
				try {
					blob = await ( $mol_wire_async( app ) as any ).local_blob( audio ) as Blob | null
				} catch {}
				if ( token !== this._dispatch_token || !this.is_current( audio ) ) return

				if ( !blob && audio.url ) {
					try {
						await app.save_hls( audio )
						blob = app.local_blob( audio ) as Blob | null
					} catch ( e: any ) {
						console.error( '[player] save_hls failed:', e?.message )
					}
					if ( token !== this._dispatch_token || !this.is_current( audio ) ) return
				}

				if ( blob ) {
					this.channel().postMessage( {
						target: 'offscreen',
						type: 'play_track',
						audio,
						blob,
						start_at,
					} )
					return
				}

				console.warn( '[player] no source:', audio.artist, '—', audio.title )
			} catch ( e: any ) {
				console.error( '[player] play failed:', e )
				this.playing( false )
			}
		}

		private async play_source_local( audio: $bog_vk_api_audio, el: HTMLAudioElement, start_at: number = 0 ) {
			const token = ++this._dispatch_token
			try {
				if ( this._last_blob_url ) {
					URL.revokeObjectURL( this._last_blob_url )
					this._last_blob_url = ''
				}

				const app = $bog_vk_app.Root( 0 )

				const blob = await ( $mol_wire_async( app ) as any ).local_blob( audio ) as Blob | null
				if ( token !== this._dispatch_token || !this.is_current( audio ) ) return

				if ( blob ) {
					const url = URL.createObjectURL( blob )
					this._last_blob_url = url
					this.attach_seek_listener( el, start_at )
					el.src = url
					await this.safe_play( el )
					return
				}

				if ( audio.url ) {
					if ( token !== this._dispatch_token || !this.is_current( audio ) ) return
					this.attach_seek_listener( el, start_at )
					el.src = audio.url
					try {
						await this.safe_play( el )
						app.save_hls( audio ).catch( () => {} )
						return
					} catch {}
				}

				if ( audio.url ) {
					await app.save_hls( audio )
					if ( token !== this._dispatch_token || !this.is_current( audio ) ) return
					const blob2 = app.local_blob( audio )
					if ( blob2 ) {
						const url = URL.createObjectURL( blob2 )
						this._last_blob_url = url
						this.attach_seek_listener( el, start_at )
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
			const mode = this.repeat_mode()
			const queue = this.queue()

			// mode='one' обрабатывается через audio.loop=true в apply_loop():
			// браузер сам перезапускает трек, `ended` не стреляет. Next-кнопка
			// при этом всё равно ведёт к следующему треку — стандартное поведение
			// плеера ("Повтор одного" не должен ломать ручной next).

			if ( mode === 'shuffle' && queue.length ) {
				const cur = this.current_audio()
				const cur_idx = cur
					? queue.findIndex( ( a: $bog_vk_api_audio ) => a.id === cur.id && a.owner_id === cur.owner_id )
					: -1
				let idx = Math.floor( Math.random() * queue.length )
				if ( queue.length > 1 && idx === cur_idx ) idx = ( idx + 1 ) % queue.length
				this._queue_idx = idx
				this.play_track( queue[ idx ] as $bog_vk_api_audio )
				return
			}

			try {
				const picked = this.pick_next( this.current_audio() ) as $bog_vk_api_audio | null
				if ( picked ) {
					const idx = queue.findIndex( ( a: $bog_vk_api_audio ) => a.id === picked.id && a.owner_id === picked.owner_id )
					if ( idx >= 0 ) this._queue_idx = idx
					this.play_track( picked )
					return
				}
			} catch ( e: any ) {
				if ( e instanceof Promise ) throw e
				console.warn( '[player] pick_next failed:', e?.message )
			}
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
			this.apply_loop()
			try { this.apply_trim() } catch ( e: any ) {
				if ( e instanceof Promise ) throw e
			}
			const style = ( this.Progress_bar().dom_node() as HTMLElement ).style
			style.width = `${this.progress_percent()}%`
		}
	}
}

