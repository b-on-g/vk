namespace $ {

	/**
	 * Расширение `$giper_baza_atom_link.to` с автоматическим запуском `.sync()`
	 * на target-land при чтении ссылки. Стандартный `remote()` только создаёт
	 * Pawn proxy без триггера sync (см. `land.ts:345` — `.sync()` закомменчен в Pawn()).
	 *
	 * Без этого blob-lands треков не подсасываются с master'а пока пользователь
	 * не нажмёт play. С этой обёрткой любой `.remote()` сразу инициирует sync.
	 */
	export function $bog_vk_atom_link_to_synced<const Value extends any>(Value: Value) {
		const Base = $giper_baza_atom_link.to(Value)
		class $bog_vk_atom_link_to_synced extends Base {
			remote(next?: any) {
				const r = (super.remote as any)(next)
				if (r && next === undefined) {
					try {
						(r as any).land().sync()
					} catch (e: any) {
						// Promise = async sync в фоне, это нормально
						if (!(e instanceof Promise)) throw e
					}
				}
				return r
			}
		}
		return $bog_vk_atom_link_to_synced as typeof Base
	}

	/**
	 * Персональная запись трека в home land пользователя.
	 * Синкается между устройствами через Giper Baza.
	 * Ключ в $giper_baza_dict_to — VK cache_key (`${owner_id}_${id}`).
	 *
	 * `File` использует synced-версию atom_link — sync blob-land автоматически
	 * запускается при первом чтении ссылки.
	 */
	export class $bog_vk_track_baza extends $giper_baza_dict.with({
		Vk_id: $giper_baza_atom.of( $mol_schema_string ),
		Title: $giper_baza_atom.of( $mol_schema_string ),
		Artist: $giper_baza_atom.of( $mol_schema_string ),
		Duration: $giper_baza_atom.of( $mol_schema_float ),
		Url: $giper_baza_atom.of( $mol_schema_string ),
		Added: $giper_baza_atom.of( $mol_schema_float ),
		Order: $giper_baza_atom.of( $mol_schema_float ),
		// Id плейлиста: '' = main, 'archive' = архив, любое другое — кастомный плейлист.
		// Расширяется без миграции схемы; полную метадату плейлистов держим в $bog_vk_store.Playlists.
		Playlist: $giper_baza_atom.of( $mol_schema_string ),
		File: $bog_vk_atom_link_to_synced(() => $giper_baza_file),
		// Персональный обрез песни (секунды). Trim_end = null означает «без обреза».
		Trim_start: $giper_baza_atom.of( $mol_schema_float ),
		Trim_end: $giper_baza_atom.of( $mol_schema_float ),
	}) {}

}
