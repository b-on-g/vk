namespace $ {

	/** Словарь cache_key → $bog_vk_track_baza. Вынесен отдельно, чтобы не циклить TS-инференс. */
	export class $bog_vk_tracks_dict extends $giper_baza_dict_to($bog_vk_track_baza) {}

	/**
	 * Хранилище треков пользователя — чистая baza-схема.
	 * Вся CRUD-логика — в $bog_vk_app как instance-методы.
	 */
	export class $bog_vk_store extends $giper_baza_dict.with({
		Tracks: $bog_vk_tracks_dict,
	}) {}

}
