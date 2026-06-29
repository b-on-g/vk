namespace $.$$ {

	export class $bog_vk_account extends $.$bog_vk_account {

		/** Профиль в home land — паттерн blitz: instance-метод, БЕЗ @$mol_mem. */
		profile_data() {
			const home = this.$.$giper_baza_glob.home()
			return home.land().Data($bog_vk_account_baza)
		}

		/**
		 * Реактивный геттер/сеттер ника. БЕЗ @$mol_mem — baza сама реактивит val(),
		 * а @$mol_mem на методах, отдающих/трогающих pawn-инстансы, вызывает destructor → Circular.
		 */
		nickname(next?: string) {
			const profile = this.profile_data()
			if (next !== undefined) {
				profile.Nickname('auto')!.val(next)
				return next
			}
			return profile.Nickname()?.val() ?? ''
		}

		@$mol_mem
		nickname_label() {
			try {
				return this.nickname()
			} catch (e) {
				if (e instanceof Promise) throw e
				return ''
			}
		}

		@$mol_mem
		lord_short() {
			try {
				const auth = this.$.$giper_baza_auth.current()
				if (!auth) return '—'
				return auth.pass().lord().str.slice(0, 8) + '…'
			} catch (e) {
				if (e instanceof Promise) throw e
				return '—'
			}
		}

		account_key() {
			return String(this.$.$mol_state_local.value('$giper_baza_auth') ?? '')
		}

		account_link() {
			const key = this.account_key()
			if (!key) return ''
			const proto = location.protocol
			if (proto === 'chrome-extension:' || proto === 'moz-extension:') {
				return 'https://b-on-g.github.io/vk/#account=' + encodeURIComponent(key)
			}
			const base = location.origin + location.pathname + location.search
			return base + '#account=' + encodeURIComponent(key)
		}

		@$mol_mem
		copy_status(next?: string) {
			return next ?? ''
		}

		@$mol_action
		copy() {
			const link = this.account_link()
			if (!link) {
				this.copy_status('Ключ не найден')
				return
			}
			try {
				navigator.clipboard.writeText(link)
				this.copy_status('Скопировано. Не делись публично!')
			} catch (e: any) {
				console.warn('[account] clipboard failed:', e?.message)
				this.copy_status('Не удалось — скопируй из адресной строки: ' + link)
			}
		}

		@$mol_mem
		import_link(next?: string) {
			return next ?? ''
		}

		@$mol_mem
		import_status(next?: string) {
			return next ?? ''
		}

		/** Форвард на app.download_playlist() — в extension в baza, в PWA zip-архивом. */
		download_playlist() {
			$bog_vk_app.Root(0).download_playlist()
			return null
		}

		download_playlist_label() {
			return $bog_vk_api.in_extension() ? this.ext_label() : this.pwa_label()
		}

		download_playlist_hint() {
			return $bog_vk_api.in_extension() ? this.ext_hint() : this.pwa_hint()
		}

		download_playlist_status() {
			try {
				return $bog_vk_app.Root(0).download_playlist_status()
			} catch (e: any) {
				if (e instanceof Promise) throw e
				return ''
			}
		}

		@$mol_action
		reset_account() {
			if (typeof window === 'undefined') return
			try {
				const ext = (globalThis as any).chrome
				if (ext?.storage?.local?.clear) ext.storage.local.clear()
			} catch {}
			try { window.localStorage.clear() } catch {}
			try {
				const idb = (globalThis as any).indexedDB
				if (idb?.deleteDatabase) {
					idb.deleteDatabase('$giper_baza_mine')
					idb.deleteDatabase('vk_audio_cache')
				}
			} catch {}
			setTimeout(() => location.reload(), 100)
		}

		@$mol_action
		apply_import() {
			const raw = this.import_link().trim()
			if (!raw) {
				this.import_status('Вставь ссылку с #account=…')
				return
			}
			const match = raw.match(/[#&]account=([^&\s]+)/)
			const key = match ? decodeURIComponent(match[1]) : raw
			if (key.length < 172) {
				this.import_status('Ключ слишком короткий')
				return
			}
			const current = this.$.$mol_state_local.value('$giper_baza_auth')
			if (current !== key) this.$.$mol_state_local.value('$giper_baza_auth', key)
			this.import_status(current === key ? 'Перезапуск…' : 'Применено, перезагрузка…')
			location.reload()
		}
	}
}
