namespace $ {

	/**
	 * Профиль пользователя в home land.
	 * Никнейм отображается в шапке/попапе аккаунта.
	 */
	export class $bog_vk_account_baza extends $giper_baza_dict.with({
		Nickname: $giper_baza_atom_text,
	}) {}

}
