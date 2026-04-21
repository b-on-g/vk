namespace $ {

	/**
	 * Персональная запись трека в home land пользователя.
	 * Синкается между устройствами через Giper Baza.
	 * Ключ в $giper_baza_dict_to — VK cache_key (`${owner_id}_${id}`).
	 */
	export class $bog_vk_track_baza extends $giper_baza_dict.with({
		Vk_id: $giper_baza_atom_text,
		Title: $giper_baza_atom_text,
		Artist: $giper_baza_atom_text,
		Duration: $giper_baza_atom_real,
		Url: $giper_baza_atom_text,
		Added: $giper_baza_atom_real,
		Order: $giper_baza_atom_real,
		Archived: $giper_baza_atom_bool,
	}) {}

}
