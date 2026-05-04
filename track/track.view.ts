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
			$bog_vk_cache.version()
			return ($mol_wire_sync($bog_vk_cache) as any).is_cached(audio) as boolean
		}

		is_local() {
			return this.audio_data()?.owner_id === 0
		}

		can_drag() {
			return !this.archive_mode()
		}

		Archive() {
			if (this.archive_mode()) return null as any
			return super.Archive()
		}

		Restore() {
			if (!this.archive_mode()) return null as any
			return super.Restore()
		}

		Delete_forever() {
			if (!this.archive_mode()) return null as any
			return super.Delete_forever()
		}

		Delete() {
			if (this.archive_mode()) return null as any
			if (this.is_local()) return null as any
			if (!this.cached()) return null as any
			return super.Delete()
		}

		on_play_click() {
			this.play(this.audio())
		}

		event_drag_start(event: DragEvent) {
			if (!this.can_drag()) {
				event.preventDefault()
				return
			}
			try {
				event.dataTransfer?.setData('text/x-bog-track', '1')
				if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
			} catch {}
			this.drag_start()
		}

		event_drag_over(event: DragEvent) {
			if (!this.can_drag()) return
			event.preventDefault()
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
		}

		event_drop(event: DragEvent) {
			if (!this.can_drag()) return
			event.preventDefault()
			this.drop_here()
		}

		delete_cached() {
			const audio = this.audio_data()
			if (!audio) return
			;($mol_wire_sync($bog_vk_cache) as any).drop(audio)
			this.cached(false)
			$bog_vk_cache.version($bog_vk_cache.version() + 1)
		}
	}
}
