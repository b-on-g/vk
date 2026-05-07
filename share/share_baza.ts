namespace $ {

	/**
	 * Эфемерный share-land — содержит копию выбранных треков + имя отправителя.
	 * Sender создаёт через `$giper_baza_glob.land_grab()`, наполняет, шарит публичный
	 * link через URL `?share=<linkstr>`. Recipient читает, копирует треки в home
	 * land с `Playlist: 'shared_<sender>'`.
	 */
	export class $bog_vk_share_baza extends $giper_baza_dict.with({
		Sender: $giper_baza_atom_text,
		Tracks: $bog_vk_tracks_dict,
	}) {}

}
