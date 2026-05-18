namespace $ {

	/**
	 * Шаренный трек: зашифрованные метаданные + ссылка на отдельный land
	 * с зашифрованным буфером файла. Шифрование AES-CBC на стороне приложения
	 * с одноразовым ключом из URL — see $bog_vk_app.create_share / import_share.
	 *
	 * Meta содержит JSON {artist,title,duration,mime,owner_id,id} в виде
	 * `[16 bytes IV][ciphertext]`. File.buffer() — то же самое для аудио-байт.
	 */
	export class $bog_vk_share_track_baza extends $giper_baza_dict.with({
		Meta: $giper_baza_atom.of( Uint8Array ),
		File: $bog_vk_atom_link_to_synced(() => $giper_baza_file),
	}) {}

	export class $bog_vk_share_tracks_dict extends $giper_baza_dict_to($bog_vk_share_track_baza) {}

	/**
	 * Эфемерный share-land. `[null, $giper_baza_rank_read]` — публичное чтение
	 * (на самом деле приватное: link достаточно длинный, payload зашифрован).
	 *
	 * Verifier — фиксированная зашифрованная строка для быстрой проверки ключа
	 * на стороне получателя без расшифровки крупного блоба.
	 */
	export class $bog_vk_share_baza extends $giper_baza_dict.with({
		Sender: $giper_baza_atom.of( Uint8Array ),
		Verifier: $giper_baza_atom.of( Uint8Array ),
		// Ожидаемое число треков в шаре. Используется получателем для polling'а
		// синка — `tracks.keys().length` догоняет до Count или истекает таймаут.
		// Plaintext (приватность count'а — приемлемая утечка).
		Count: $giper_baza_atom.of( $mol_schema_float ),
		Tracks: $bog_vk_share_tracks_dict,
	}) {}

}
