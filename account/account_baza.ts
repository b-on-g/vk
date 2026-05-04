namespace $ {

	/**
	 * Профиль пользователя в home land — чистая baza-схема.
	 * CRUD — в $bog_vk_account как instance-методы.
	 */
	export class $bog_vk_account_baza extends $giper_baza_dict.with({
		Nickname: $giper_baza_atom_text,
	}) {}

}
