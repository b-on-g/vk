namespace $.$$ {

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
			dv.setUint32(p, 0x04034b50, true); p += 4
			dv.setUint16(p, 20, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint32(p, e.crc, true); p += 4
			dv.setUint32(p, e.data.length, true); p += 4
			dv.setUint32(p, e.data.length, true); p += 4
			dv.setUint16(p, e.name_bytes.length, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			buf.set(e.name_bytes, p); p += e.name_bytes.length
			buf.set(e.data, p); p += e.data.length
		}

		const cd_offset = p
		for (const e of entries) {
			dv.setUint32(p, 0x02014b50, true); p += 4
			dv.setUint16(p, 20, true); p += 2
			dv.setUint16(p, 20, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint32(p, e.crc, true); p += 4
			dv.setUint32(p, e.data.length, true); p += 4
			dv.setUint32(p, e.data.length, true); p += 4
			dv.setUint16(p, e.name_bytes.length, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint16(p, 0, true); p += 2
			dv.setUint32(p, 0, true); p += 4
			dv.setUint32(p, e.offset, true); p += 4
			buf.set(e.name_bytes, p); p += e.name_bytes.length
		}

		const cd_size = p - cd_offset

		dv.setUint32(p, 0x06054b50, true); p += 4
		dv.setUint16(p, 0, true); p += 2
		dv.setUint16(p, 0, true); p += 2
		dv.setUint16(p, entries.length, true); p += 2
		dv.setUint16(p, entries.length, true); p += 2
		dv.setUint32(p, cd_size, true); p += 4
		dv.setUint32(p, cd_offset, true); p += 4
		dv.setUint16(p, 0, true); p += 2

		return buf
	}

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

		@$mol_mem
		download_all_status(next?: string) {
			return next ?? ''
		}

		/** Триггер: запускает async-генератор ZIP из baza-блобов. */
		download_all() {
			$mol_wire_async(this).download_all_async()
			return null
		}

		async download_all_async() {
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

			const app = $bog_vk_app.Root(0)
			// Порядок такой же, как в UI (сверху вниз). Префикс с индексом сохраняет
			// его в файлменеджере несмотря на алфавитную сортировку.
			const tracks = [
				...app.saved_audios(),
				...app.archived_audios(),
			]
			if (!tracks.length) {
				this.download_all_status('Нечего скачивать')
				return
			}

			const entries: { name: string, data: Uint8Array }[] = []
			const pad = String(tracks.length).length
			let i = 0
			for (const audio of tracks) {
				++i
				this.download_all_status(`Сборка ${i}/${tracks.length}…`)
				let blob: Blob | null = null
				let mime = 'audio/aac'
				try {
					// Через wire_async — иначе throw Promise (baza loading) ретраит ВСЮ
					// download_all_async с начала → бесконечный цикл "skip" логов.
					blob = await ($mol_wire_async(app) as any).local_blob(audio) as Blob | null
					mime = blob?.type || 'audio/mpeg'
				} catch (e: any) {
					console.warn('[account] zip skip:', audio.title, e?.message ?? e)
				}
				if (!blob) continue
				const ext = ext_of(mime)
				// Префикс с zero-padded индексом — иначе файлменеджер сортирует по
				// алфавиту имени артиста, и порядок прослушивания теряется.
				const idx = String(i).padStart(pad, '0')
				const name = `${idx}. ${safe(audio.artist)} - ${safe(audio.title)}.${ext}`
				entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) })
			}

			if (!entries.length) {
				this.download_all_status('Нет доступных аудио')
				return
			}

			this.download_all_status(`Упаковка ${entries.length}…`)
			const zip = build_zip(entries)
			const url = URL.createObjectURL(new Blob([zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer], { type: 'application/zip' }))
			const a = document.createElement('a')
			a.href = url
			a.download = `bog-vk-music-${ new Date().toISOString().slice(0, 10) }.zip`
			document.body.appendChild(a)
			a.click()
			a.remove()
			setTimeout(() => URL.revokeObjectURL(url), 60_000)
			this.download_all_status(`Готово, ${entries.length} файлов`)
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
