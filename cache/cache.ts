namespace $ {

	type $bog_vk_cache_schema = {
		tracks: {
			Key: string
			Doc: Blob
			Indexes: {}
		}
		meta: {
			Key: string
			Doc: $bog_vk_api_audio
			Indexes: {}
		}
	}

	export class $bog_vk_cache extends $mol_object {

		static db() {
			return $mol_wire_sync(this).db_async()
		}

		static async db_async() {
			return $$.$mol_db<$bog_vk_cache_schema>(
				'vk_audio_cache',
				mig => mig.store_make('tracks'),
				mig => mig.store_make('meta'),
			)
		}

		static cache_key(audio: $bog_vk_api_audio) {
			return `${audio.owner_id}_${audio.id}`
		}

		static async get(audio: $bog_vk_api_audio): Promise<string | null> {
			const key = this.cache_key(audio)
			try {
				const db = await this.db_async()
				const blob = await db.read('tracks').tracks.get(key)
				db.destructor()
				if (blob) {
					// Re-mux old audio/aac entries to audio/mp4
					if (blob.type === 'audio/aac') {
						console.log(`[cache] migrating ${audio.artist} — ${audio.title} from aac to m4a...`)
						const adts = new Uint8Array(await blob.arrayBuffer())
						const m4a = this.adts_to_m4a(adts)
						const newBlob = new Blob([m4a.buffer as ArrayBuffer], { type: 'audio/mp4' })
						const db2 = await this.db_async()
						const tx = db2.change('tracks')
						await tx.stores.tracks.put(newBlob, key)
						db2.destructor()
						return URL.createObjectURL(newBlob)
					}
					console.log(`[cache] hit: ${audio.artist} — ${audio.title} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`)
					return URL.createObjectURL(blob)
				}
				console.warn(`[cache] miss: ${audio.artist} — ${audio.title} (key: ${key})`)
				return null
			} catch (e: any) {
				console.warn(`[cache] get error: ${key}`, e?.message)
				return null
			}
		}

		static async all_cached(): Promise<$bog_vk_api_audio[]> {
			try {
				const db = await this.db_async()
				const all = await db.read('meta').meta.select()
				db.destructor()
				return all
			} catch {
				return []
			}
		}

		static adts_to_m4a(adts: Uint8Array): Uint8Array {
			const frames: Uint8Array[] = []
			const frameSizes: number[] = []
			let audioObjectType = 2
			let sampleRateIndex = 4
			let channelConfig = 2

			let i = 0
			while (i < adts.length - 7) {
				if (adts[i] !== 0xFF || (adts[i + 1] & 0xF6) !== 0xF0) { i++; continue }

				const protAbsent = adts[i + 1] & 0x01
				const profile = (adts[i + 2] >> 6) & 0x03
				const srIdx = (adts[i + 2] >> 2) & 0x0F
				const chCfg = ((adts[i + 2] & 0x01) << 2) | ((adts[i + 3] >> 6) & 0x03)
				const frameLen = ((adts[i + 3] & 0x03) << 11) | (adts[i + 4] << 3) | ((adts[i + 5] >> 5) & 0x07)

				if (frameLen < 7 || i + frameLen > adts.length) { i++; continue }

				audioObjectType = profile + 1
				sampleRateIndex = srIdx
				channelConfig = chCfg

				const hdrLen = protAbsent ? 7 : 9
				const raw = adts.slice(i + hdrLen, i + frameLen)
				frames.push(raw)
				frameSizes.push(raw.length)
				i += frameLen
			}

			if (frames.length === 0) return adts

			const sampleRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
			const sampleRate = sampleRates[sampleRateIndex] || 44100
			const totalSamples = frames.length * 1024
			const rawSize = frameSizes.reduce((a, b) => a + b, 0)

			// AudioSpecificConfig (2 bytes)
			const asc0 = (audioObjectType << 3) | (sampleRateIndex >> 1)
			const asc1 = ((sampleRateIndex & 1) << 7) | (channelConfig << 3)

			const u32 = (v: number): number[] => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]
			const u16 = (v: number): number[] => [(v >> 8) & 0xFF, v & 0xFF]
			const str = (s: string) => s.split('').map(c => c.charCodeAt(0))
			const box = (type: string, payload: number[]) => [...u32(8 + payload.length), ...str(type), ...payload]
			const fbox = (type: string, ver: number, fl: number, payload: number[]) =>
				[...u32(12 + payload.length), ...str(type), ver, (fl >> 16) & 0xFF, (fl >> 8) & 0xFF, fl & 0xFF, ...payload]

			// ftyp
			const ftyp = box('ftyp', [...str('M4A '), ...u32(0), ...str('M4A '), ...str('isom'), ...str('mp42')])

			// esds descriptor chain
			const decSpecInfo = [0x05, 0x02, asc0, asc1]
			const decConfigPayload = [0x40, 0x15, 0x00, 0x00, 0x00, ...u32(0), ...u32(0), ...decSpecInfo]
			const decConfig = [0x04, decConfigPayload.length, ...decConfigPayload]
			const slConfig = [0x06, 0x01, 0x02]
			const esPayload = [...u16(1), 0x00, ...decConfig, ...slConfig]
			const esDescr = [0x03, esPayload.length, ...esPayload]
			const esds = fbox('esds', 0, 0, esDescr)

			// mp4a sample entry
			const mp4aPayload = [
				...Array(6).fill(0), ...u16(1), // reserved + data_reference_index
				...Array(8).fill(0), // reserved
				...u16(channelConfig), ...u16(16), // channels, sample_size
				...u16(0), ...u16(0), // compression_id, packet_size
				...u16(sampleRate), ...u16(0), // samplerate 16.16 fixed
				...esds,
			]
			const mp4a = [...u32(8 + mp4aPayload.length), ...str('mp4a'), ...mp4aPayload]

			const stsd = fbox('stsd', 0, 0, [...u32(1), ...mp4a])
			const stts = fbox('stts', 0, 0, [...u32(1), ...u32(frames.length), ...u32(1024)])
			const stsc = fbox('stsc', 0, 0, [...u32(1), ...u32(1), ...u32(frames.length), ...u32(1)])
			const stsz = fbox('stsz', 0, 0, [...u32(0), ...u32(frames.length), ...frameSizes.flatMap(s => u32(s))])
			const stco = fbox('stco', 0, 0, [...u32(1), ...u32(0)]) // offset patched below

			const stbl = box('stbl', [...stsd, ...stts, ...stsc, ...stsz, ...stco])

			const smhd = fbox('smhd', 0, 0, [...u16(0), ...u16(0)])
			const urlBox = fbox('url ', 0, 1, [])
			const dref = fbox('dref', 0, 0, [...u32(1), ...urlBox])
			const dinf = box('dinf', dref)
			const minf = box('minf', [...smhd, ...dinf, ...stbl])

			const mdhd = fbox('mdhd', 0, 0, [...u32(0), ...u32(0), ...u32(sampleRate), ...u32(totalSamples), ...u16(0x55C4), ...u16(0)])
			const hdlr = fbox('hdlr', 0, 0, [...u32(0), ...str('soun'), ...u32(0), ...u32(0), ...u32(0), 0])
			const mdia = box('mdia', [...mdhd, ...hdlr, ...minf])

			const identity = [
				0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0,
				0, 0, 0, 0, 0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0,
				0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0x00, 0x00, 0x00,
			]
			const tkhd = fbox('tkhd', 0, 3, [
				...u32(0), ...u32(0), ...u32(1), ...u32(0), ...u32(totalSamples),
				...u32(0), ...u32(0), ...u16(0), ...u16(0), ...u16(0x0100), ...u16(0),
				...identity, ...u32(0), ...u32(0),
			])
			const trak = box('trak', [...tkhd, ...mdia])

			const mvhd = fbox('mvhd', 0, 0, [
				...u32(0), ...u32(0), ...u32(sampleRate), ...u32(totalSamples),
				...u32(0x00010000), ...u16(0x0100), ...Array(10).fill(0),
				...identity, ...Array(24).fill(0), ...u32(2),
			])
			const moov = box('moov', [...mvhd, ...trak])

			// Patch stco chunk_offset: mdat data starts after ftyp + moov + mdat header(8)
			const mdatDataOffset = ftyp.length + moov.length + 8
			for (let j = 0; j < moov.length - 4; j++) {
				if (moov[j] === 0x73 && moov[j + 1] === 0x74 && moov[j + 2] === 0x63 && moov[j + 3] === 0x6F) {
					// 'stco' found: type(4) + version(1) + flags(3) + entry_count(4) = 12 bytes to offset
					const p = j + 12
					moov[p] = (mdatDataOffset >>> 24) & 0xFF
					moov[p + 1] = (mdatDataOffset >>> 16) & 0xFF
					moov[p + 2] = (mdatDataOffset >>> 8) & 0xFF
					moov[p + 3] = mdatDataOffset & 0xFF
					break
				}
			}

			// Assemble: ftyp + moov + mdat
			const mdatHeader = [...u32(8 + rawSize), ...str('mdat')]
			const total = ftyp.length + moov.length + mdatHeader.length + rawSize
			const out = new Uint8Array(total)
			let pos = 0
			out.set(ftyp, pos); pos += ftyp.length
			out.set(moov, pos); pos += moov.length
			out.set(mdatHeader, pos); pos += mdatHeader.length
			for (const frame of frames) {
				out.set(frame, pos); pos += frame.length
			}

			console.log(`[cache] muxed ${frames.length} AAC frames → ${(total / 1024).toFixed(0)} KB M4A`)
			return out
		}

		static extract_audio(ts: Uint8Array): { data: Uint8Array, mime: string } {
			// Already raw AAC (ADTS)
			if (ts[0] === 0xFF && (ts[1] & 0xF0) === 0xF0) {
				return { data: ts, mime: 'audio/aac' }
			}

			// Already MP3
			if (ts[0] === 0xFF && (ts[1] & 0xE0) === 0xE0) {
				return { data: ts, mime: 'audio/mpeg' }
			}

			// ID3 tag (MP3 with metadata)
			if (ts[0] === 0x49 && ts[1] === 0x44 && ts[2] === 0x33) {
				return { data: ts, mime: 'audio/mpeg' }
			}

			// MPEG-TS → proper demux: parse TS packets, extract PES audio payloads
			if (ts[0] === 0x47) {
				const audio = this.demux_ts_audio(ts)
				if (audio) return { data: audio, mime: 'audio/aac' }
			}

			// Fallback: return as-is
			return { data: ts, mime: 'audio/mpeg' }
		}

		static demux_ts_audio(ts: Uint8Array): Uint8Array | null {
			// Phase 1: parse TS packets, group payloads by PID
			const pidChunks = new Map<number, { pusi: boolean, data: Uint8Array }[]>()

			for (let pos = 0; pos + 188 <= ts.length; pos += 188) {
				if (ts[pos] !== 0x47) continue

				const pusi = !!(ts[pos + 1] & 0x40)
				const pid = ((ts[pos + 1] & 0x1F) << 8) | ts[pos + 2]
				const afc = (ts[pos + 3] >> 4) & 0x03

				if (pid === 0 || pid === 0x1FFF) continue // skip PAT / null
				if (!(afc & 0x01)) continue // no payload

				let off = 4
				if (afc & 0x02) off += 1 + ts[pos + 4] // adaptation field
				if (off >= 188) continue

				if (!pidChunks.has(pid)) pidChunks.set(pid, [])
				pidChunks.get(pid)!.push({ pusi, data: ts.slice(pos + off, pos + 188) })
			}

			// Phase 2: find audio PID (PES stream_id 0xC0..0xDF)
			for (const [pid, chunks] of pidChunks) {
				const first = chunks.find(c => c.pusi)
				if (!first) continue
				const d = first.data
				if (d.length < 9) continue
				if (d[0] !== 0x00 || d[1] !== 0x00 || d[2] !== 0x01) continue
				if (d[3] < 0xC0 || d[3] > 0xDF) continue // not audio

				// Phase 3: reassemble PES payloads, strip PES headers → raw ADTS
				const parts: Uint8Array[] = []
				for (const chunk of chunks) {
					if (chunk.pusi) {
						const p = chunk.data
						if (p.length < 9 || p[0] !== 0x00 || p[1] !== 0x00 || p[2] !== 0x01) continue
						const pesHdrLen = 9 + p[8]
						if (pesHdrLen < p.length) {
							parts.push(p.slice(pesHdrLen))
						}
					} else {
						parts.push(chunk.data)
					}
				}

				const total = parts.reduce((s, p) => s + p.length, 0)
				if (total === 0) continue
				const out = new Uint8Array(total)
				let off = 0
				for (const p of parts) { out.set(p, off); off += p.length }
				console.log(`[cache] demuxed TS: PID ${pid}, ${total} bytes raw ADTS`)
				return out
			}

			return null
		}

		static parse_m3u8(text: string, base_url: string) {
			const lines = text.split('\n')
			let key_url = ''
			let key_iv = ''
			const segments: string[] = []

			for (const line of lines) {
				const trimmed = line.trim()
				if (trimmed.startsWith('#EXT-X-KEY:')) {
					const uri_match = trimmed.match(/URI="([^"]+)"/)
					if (uri_match) {
						key_url = uri_match[1].startsWith('http') ? uri_match[1] : base_url + uri_match[1]
					}
					const iv_match = trimmed.match(/IV=0x([0-9a-fA-F]+)/)
					if (iv_match) {
						key_iv = iv_match[1]
					}
				} else if (trimmed && !trimmed.startsWith('#')) {
					segments.push(trimmed.startsWith('http') ? trimmed : base_url + trimmed)
				}
			}

			return { segments, key_url, key_iv }
		}

		static async decrypt_segment(data: ArrayBuffer, cryptoKey: CryptoKey, index: number, iv_hex: string): Promise<ArrayBuffer> {
			let iv: ArrayBuffer
			if (iv_hex) {
				const bytes = new Uint8Array(16)
				for (let i = 0; i < 16 && i * 2 < iv_hex.length; i++) {
					bytes[i] = parseInt(iv_hex.substring(i * 2, i * 2 + 2), 16)
				}
				iv = bytes.buffer as ArrayBuffer
			} else {
				const bytes = new Uint8Array(16)
				bytes[15] = index & 0xFF
				bytes[14] = (index >> 8) & 0xFF
				bytes[13] = (index >> 16) & 0xFF
				bytes[12] = (index >> 24) & 0xFF
				iv = bytes.buffer as ArrayBuffer
			}

			return crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data)
		}

		static async save_hls(audio: $bog_vk_api_audio): Promise<void> {
			const url = audio.url
			if (!url) {
				console.warn('[cache] skip — no URL:', audio.artist, '—', audio.title)
				return
			}

			const cache_id = this.cache_key(audio)

			try {
				const db_check = await this.db_async()
				const existing = await db_check.read('tracks').tracks.count(cache_id)
				db_check.destructor()
				if (existing > 0) {
					console.log('[cache] already cached:', audio.artist, '—', audio.title)
					return
				}

				console.log('[cache] start download:', audio.artist, '—', audio.title)

				const m3u8_resp = await fetch(url)
				if (!m3u8_resp.ok) throw new Error(`m3u8 fetch ${m3u8_resp.status}`)
				const m3u8_text = await m3u8_resp.text()

				const base_url = url.substring(0, url.lastIndexOf('/') + 1)
				const { segments, key_url, key_iv } = this.parse_m3u8(m3u8_text, base_url)

				if (!segments.length) throw new Error('No segments in m3u8')

				let cryptoKey: CryptoKey | null = null
				if (key_url) {
					console.log(`[cache] encrypted HLS, fetching key from:`, key_url)
					const key_resp = await fetch(key_url)
					if (!key_resp.ok) throw new Error(`Key fetch failed: ${key_resp.status}`)
					const key_data = await key_resp.arrayBuffer()
					console.log(`[cache] key size: ${key_data.byteLength} bytes, hex: ${Array.from(new Uint8Array(key_data)).map(b => b.toString(16).padStart(2, '0')).join('')}`)
					if (key_data.byteLength !== 16) {
						console.warn(`[cache] unexpected key size ${key_data.byteLength}, expected 16`)
					}
					cryptoKey = await crypto.subtle.importKey('raw', key_data, 'AES-CBC', false, ['decrypt'])
					console.log(`[cache] key imported, IV: ${key_iv || '(sequence number)'}`)
				}

				console.log(`[cache] ${segments.length} segments to download${cryptoKey ? ' (encrypted)' : ''}`)

				const chunks: ArrayBuffer[] = []
				for (let i = 0; i < segments.length; i++) {
					const resp = await fetch(segments[i])
					if (!resp.ok) throw new Error(`Segment ${i + 1}/${segments.length} failed: ${resp.status}`)
					let data = await resp.arrayBuffer()
					const firstByte = new Uint8Array(data)[0]
					if (cryptoKey && firstByte !== 0x47) {
						data = await this.decrypt_segment(data, cryptoKey, i, key_iv)
					}
					chunks.push(data)
				}

				const total = chunks.reduce((s, c) => s + c.byteLength, 0)
				const merged = new Uint8Array(total)
				let offset = 0
				for (const chunk of chunks) {
					merged.set(new Uint8Array(chunk), offset)
					offset += chunk.byteLength
				}

				let { data: audioData, mime } = this.extract_audio(merged)
				if (mime === 'audio/aac') {
					audioData = this.adts_to_m4a(audioData)
					mime = 'audio/mp4'
				}
				const blob = new Blob([audioData.buffer as ArrayBuffer], { type: mime })
				const sizeMB = (audioData.byteLength / 1024 / 1024).toFixed(1)
				console.log(`[cache] format: ${mime}, extracted ${sizeMB} MB from ${(total / 1024 / 1024).toFixed(1)} MB raw`)

				const db = await this.db_async()
				const tx = db.change('tracks', 'meta')
				await tx.stores.tracks.put(blob, cache_id)
				await tx.stores.meta.put({ ...audio, url: '' }, cache_id)
				db.destructor()

				console.log(`[cache] saved: ${audio.artist} — ${audio.title} (${sizeMB} MB)`)
			} catch (e: any) {
				console.warn(`[cache] FAILED: ${audio.artist} — ${audio.title}:`, e?.message || e?.name || String(e), e)
			}
		}
	}
}
