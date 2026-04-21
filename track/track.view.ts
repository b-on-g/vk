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

		Move_up() {
			if (this.archive_mode()) return null as any
			if (!this.can_move_up()) return null as any
			return super.Move_up()
		}

		Move_down() {
			if (this.archive_mode()) return null as any
			if (!this.can_move_down()) return null as any
			return super.Move_down()
		}

		Archive() {
			if (this.archive_mode()) return null as any
			return super.Archive()
		}

		Restore() {
			if (!this.archive_mode()) return null as any
			return super.Restore()
		}

		Download() {
			if (this.archive_mode()) return null as any
			if (this.cached()) return null as any
			return super.Download()
		}

		Delete() {
			if (this.archive_mode()) return null as any
			if (!this.cached()) return null as any
			return super.Delete()
		}

		/** Был ли клик внутри какой-то кнопки-хэндлера — чтобы не проигрывать трек. */
		private click_on_button(event: Event, getter: () => any): boolean {
			try {
				const node = getter().dom_node() as Node
				if (node.contains(event.target as Node)) return true
			} catch {}
			return false
		}

		event_click(event: Event) {
			if (this.click_on_button(event, () => this.Download())) return
			if (this.click_on_button(event, () => this.Delete())) return
			if (this.click_on_button(event, () => this.Move_up())) return
			if (this.click_on_button(event, () => this.Move_down())) return
			if (this.click_on_button(event, () => this.Archive())) return
			if (this.click_on_button(event, () => this.Restore())) return
			this.play(this.audio())
		}

		download() {
			const audio = this.audio_data()
			if (!audio || !audio.url) {
				throw new Error(`Нет ссылки для скачивания`)
			}
			;($mol_wire_sync($bog_vk_cache) as any).save_hls(audio)
			this.cached(true)
			// Синкаем трек в персональный Giper Baza home land.
			try { $bog_vk_store.save_track(audio) } catch (e: any) {
				if (e instanceof Promise) return
				console.warn('[track] baza save failed:', e?.message)
			}
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
