namespace $.$$ {

	// CRC-32 IEEE polynomial 0xEDB88320, table-driven.
	const CRC_TABLE = (() => {
		const t = new Uint32Array(256)
		for (let n = 0; n < 256; n++) {
			let c = n
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
			t[n] = c
		}
		return t
	})()

	function crc32(buf: Uint8Array): number {
		let c = 0xFFFFFFFF
		for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
		return (c ^ 0xFFFFFFFF) >>> 0
	}

	/** Минимальный stored (uncompressed) ZIP encoder — см. APPNOTE.TXT. */
	function build_zip(files: { name: string, data: Uint8Array }[]): Uint8Array {
		const enc = new TextEncoder()
		type Entry = { name_bytes: Uint8Array, data: Uint8Array, crc: number, offset: number }
		const entries: Entry[] = []

		let total_local = 0
		for (const f of files) {
			const name_bytes = enc.encode(f.name)
			const crc = crc32(f.data)
			entries.push({ name_bytes, data: f.data, crc, offset: total_local })
			total_local += 30 + name_bytes.length + f.data.length
		}

		let total_central = 0
		for (const e of entries) total_central += 46 + e.name_bytes.length

		const total_size = total_local + total_central + 22
		const buf = new Uint8Array(total_size)
		const dv = new DataView(buf.buffer)
		let p = 0

		for (const e of entries) {
			dv.setUint32(p, 0x04034b50, true); p += 4 // local file header sig
			dv.setUint16(p, 20, true); p += 2          // version needed
			dv.setUint16(p, 0, true); p += 2           // flags
			dv.setUint16(p, 0, true); p += 2           // method (store)
			dv.setUint16(p, 0, true); p += 2           // mtime
			dv.setUint16(p, 0, true); p += 2           // mdate
			dv.setUint32(p, e.crc, true); p += 4       // crc
			dv.setUint32(p, e.data.length, true); p += 4 // compressed size
			dv.setUint32(p, e.data.length, true); p += 4 // uncompressed size
			dv.setUint16(p, e.name_bytes.length, true); p += 2 // name len
			dv.setUint16(p, 0, true); p += 2           // extra len
			buf.set(e.name_bytes, p); p += e.name_bytes.length
			buf.set(e.data, p); p += e.data.length
		}

		const cd_offset = p
		for (const e of entries) {
			dv.setUint32(p, 0x02014b50, true); p += 4 // central dir entry sig
			dv.setUint16(p, 20, true); p += 2          // version made by
			dv.setUint16(p, 20, true); p += 2          // version needed
			dv.setUint16(p, 0, true); p += 2           // flags
			dv.setUint16(p, 0, true); p += 2           // method
			dv.setUint16(p, 0, true); p += 2           // mtime
			dv.setUint16(p, 0, true); p += 2           // mdate
			dv.setUint32(p, e.crc, true); p += 4
			dv.setUint32(p, e.data.length, true); p += 4
			dv.setUint32(p, e.data.length, true); p += 4
			dv.setUint16(p, e.name_bytes.length, true); p += 2
			dv.setUint16(p, 0, true); p += 2           // extra len
			dv.setUint16(p, 0, true); p += 2           // comment len
			dv.setUint16(p, 0, true); p += 2           // disk #
			dv.setUint16(p, 0, true); p += 2           // internal attr
			dv.setUint32(p, 0, true); p += 4           // external attr
			dv.setUint32(p, e.offset, true); p += 4    // local header offset
			buf.set(e.name_bytes, p); p += e.name_bytes.length
		}

		const cd_size = p - cd_offset

		dv.setUint32(p, 0x06054b50, true); p += 4 // EOCD sig
		dv.setUint16(p, 0, true); p += 2          // disk #
		dv.setUint16(p, 0, true); p += 2          // disk with cd
		dv.setUint16(p, entries.length, true); p += 2
		dv.setUint16(p, entries.length, true); p += 2
		dv.setUint32(p, cd_size, true); p += 4
		dv.setUint32(p, cd_offset, true); p += 4
		dv.setUint16(p, 0, true); p += 2          // comment len

		return buf
	}

	export class $bog_vk_account extends $.$bog_vk_account {

		static land() {
			return this.$.$giper_baza_glob.home().land()
		}

		/** Один и тот же Profile pawn-инстанс — нужен, чтобы реактивные подписки
		 *  на `Nickname().val()` сохранялись между перерисовками view. */
		@$mol_mem
		static profile() {
			const Profile = $bog_vk_account_baza
			return this.land().Data(Profile)
		}

		/** Без `@$mol_mem` — getter напрямую читает Giper Baza, и любое
		 *  внешнее изменение (включая sync с другого устройства) ре-рендерит UI
		 *  через стандартную реактивность baza. */
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
			const proto = location.protocol
			// В расширении origin = chrome-extension://<id>/ — такая ссылка не откроется на чужом
			// устройстве. Подменяем на публичный gh-pages хост, куда деплоится тот же билд.
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

		@$mol_mem
		download_all_status(next?: string) {
			return next ?? ''
		}

		/**
		 * Собирает все треки (активные + архив) в один uncompressed ZIP и
		 * отдаёт пользователю через `<a download>`. Без npm-зависимостей —
		 * минимальный stored ZIP encoder, см. APPNOTE.TXT.
		 */
		@$mol_action
		download_all() {
			$mol_wire_async($bog_vk_account).download_all_async()
		}

		static async download_all_async() {
			const set_status = (s: string) => {
				try {
					const inst = ($bog_vk_account as any).bound?.() ?? null
					if (inst?.download_all_status) inst.download_all_status(s)
				} catch {}
			}
			const safe = (s: string) => (s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80).trim() || 'track'
			const ext_of = (mime: string) => {
				if (!mime) return 'aac'
				if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
				if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
				if (mime.includes('aac')) return 'aac'
				if (mime.includes('wav')) return 'wav'
				if (mime.includes('ogg')) return 'ogg'
				if (mime.includes('flac')) return 'flac'
				return 'bin'
			}

			const tracks = [
				...$bog_vk_store.saved_audios(),
				...$bog_vk_store.archived_audios(),
			]
			if (!tracks.length) {
				set_status('Нечего скачивать')
				return
			}

			const entries: { name: string, data: Uint8Array }[] = []
			let i = 0
			for (const audio of tracks) {
				++i
				set_status(`Сборка ${i}/${tracks.length}…`)
				let blob: Blob | null = null
				let mime = 'audio/aac'
				try {
					if (audio.owner_id === 0) {
						blob = $bog_vk_store.local_blob(audio)
						mime = blob?.type || 'audio/mpeg'
					} else {
						const url = await $bog_vk_cache.get(audio)
						if (url) {
							blob = await (await fetch(url)).blob()
							mime = blob.type || 'audio/aac'
						}
					}
				} catch (e: any) {
					console.warn('[account] zip skip:', audio.title, e?.message)
				}
				if (!blob) continue
				const ext = ext_of(mime)
				const name = `${safe(audio.artist)} - ${safe(audio.title)}.${ext}`.replace(/^_? - /, '')
				entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) })
			}

			if (!entries.length) {
				set_status('Нет доступных аудио')
				return
			}

			set_status(`Упаковка ${entries.length}…`)
			const zip = build_zip(entries)
			const url = URL.createObjectURL(new Blob([zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer], { type: 'application/zip' }))
			const a = document.createElement('a')
			a.href = url
			a.download = `bog-vk-music-${ new Date().toISOString().slice(0, 10) }.zip`
			document.body.appendChild(a)
			a.click()
			a.remove()
			setTimeout(() => URL.revokeObjectURL(url), 60_000)
			set_status(`Готово, ${entries.length} файлов`)
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
			const current = $mol_state_local.value('$giper_baza_auth')
			if (current !== key) $mol_state_local.value('$giper_baza_auth', key)
			this.import_status(current === key ? 'Перезапуск…' : 'Применено, перезагрузка…')
			location.reload()
		}
	}
}
