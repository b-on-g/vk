namespace $.$$ {
	export class $bog_vk_tracks extends $.$bog_vk_tracks {

		private _drag_index = -1

		@$mol_mem
		track_rows() {
			return this.audios().map((_: any, i: number) => this.Track(i))
		}

		track_audio(index: number) {
			return this.audios()[index] ?? null
		}

		track_current(index: number) {
			const audio = this.track_audio(index)
			const current = this.current_audio() as $bog_vk_api_audio | null
			if (!audio || !current) return false
			return audio.id === current.id && audio.owner_id === current.owner_id
		}

		@$mol_action
		track_play(index: number) {
			const audio = this.track_audio(index)
			if (audio) this.play_audio(audio)
		}

		track_can_drag(_index: number) {
			return !this.archive_mode()
		}

		track_drag_start(index: number) {
			this._drag_index = index
		}

		@$mol_action
		track_drop_here(index: number) {
			const from = this._drag_index
			this._drag_index = -1
			if (from < 0 || from === index) return
			this.reorder_to({ from, to: index })
		}

		@$mol_action
		track_archive(index: number) {
			const audio = this.track_audio(index)
			if (audio) this.archive_audio(audio)
		}

		@$mol_action
		track_restore(index: number) {
			const audio = this.track_audio(index)
			if (audio) this.restore_audio(audio)
		}

		@$mol_action
		track_delete(index: number) {
			const audio = this.track_audio(index)
			if (audio) this.delete_audio(audio)
		}
	}
}
