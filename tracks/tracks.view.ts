namespace $.$$ {
	export class $bog_vk_tracks extends $.$bog_vk_tracks {

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

		track_can_move_up(index: number) {
			if (this.archive_mode()) return false
			return index > 0
		}

		track_can_move_down(index: number) {
			if (this.archive_mode()) return false
			return index < this.audios().length - 1
		}

		@$mol_action
		track_move_up(index: number) {
			const audio = this.track_audio(index)
			if (audio) this.reorder_up(audio)
		}

		@$mol_action
		track_move_down(index: number) {
			const audio = this.track_audio(index)
			if (audio) this.reorder_down(audio)
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
