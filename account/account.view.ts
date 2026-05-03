namespace $.$$ {
	export class $bog_vk_account extends $.$bog_vk_account {

		static land() {
			return this.$.$giper_baza_glob.home().land()
		}

		static profile() {
			const Profile = $bog_vk_account_baza
			return this.land().Data(Profile)
		}

		@$mol_mem
		nickname(next?: string) {
			const profile = $bog_vk_account.profile()
			if (next !== undefined) {
				profile.Nickname('auto')!.val(next)
				return next
			}
			return profile.Nickname()?.val() ?? ''
		}

		@$mol_mem
		lord_short() {
			try {
				const auth = $giper_baza_auth.current()
				if (!auth) return '—'
				return auth.pass().lord().str.slice(0, 8) + '…'
			} catch (e) {
				if (e instanceof Promise) throw e
				return '—'
			}
		}

		account_key() {
			return String($mol_state_local.value('$giper_baza_auth') ?? '')
		}

		account_link() {
			const key = this.account_key()
			if (!key) return ''
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
			const current = $mol_state_local.value('$giper_baza_auth')
			if (current !== key) $mol_state_local.value('$giper_baza_auth', key)
			this.import_status(current === key ? 'Перезапуск…' : 'Применено, перезагрузка…')
			location.reload()
		}
	}
}
