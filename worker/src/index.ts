/**
 * Cloudflare Worker proxy for VK audio
 * Proxies requests to VK's internal API using the user's session cookie
 */

interface Env {
	ALLOWED_ORIGIN: string
}

const ALLOWED_ORIGINS = [
	'https://b-on-g.github.io',
	'http://localhost:9080',
]

function corsHeaders(request: Request): HeadersInit {
	const origin = request.headers.get('Origin') ?? ''
	const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
	return {
		'Access-Control-Allow-Origin': allowed,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	}
}

function jsonResponse(data: unknown, request: Request, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
	})
}

interface AudioItem {
	id: number
	owner_id: number
	title: string
	artist: string
	duration: number
	url: string
	album?: {
		id: number
		title: string
		thumb?: { photo_300?: string; photo_600?: string }
	}
}

/**
 * Parse VK audio data array format:
 * [id, owner_id, url, title, artist, duration, ?, ?, hash, ?, albumId, ?, ?, albumTitle, albumThumb, ...]
 */
function parseAudioArray(arr: any[]): AudioItem {
	return {
		id: arr[0],
		owner_id: arr[1],
		url: arr[2] || '',
		title: arr[3] || '',
		artist: arr[4] || '',
		duration: arr[5] || 0,
		album: arr[14] ? {
			id: arr[10] || 0,
			title: arr[13] || '',
			thumb: { photo_300: arr[14], photo_600: arr[14] },
		} : undefined,
	}
}

/** Get user's audio list */
async function handleGetAudios(request: Request) {
	const body = await request.json<{ remixsid: string; owner_id?: number; offset?: number; count?: number }>()

	if (!body.remixsid) {
		return jsonResponse({ error: 'remixsid is required' }, request, 400)
	}

	const formData = new URLSearchParams()
	formData.set('act', 'load_section')
	formData.set('al', '1')
	formData.set('claim', '0')
	formData.set('offset', String(body.offset ?? 0))
	formData.set('owner_id', String(body.owner_id ?? 0))
	formData.set('playlist_id', '-1')
	formData.set('type', 'playlist')

	const response = await fetch('https://vk.com/al_audio.php', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': `remixsid=${body.remixsid}`,
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'X-Requested-With': 'XMLHttpRequest',
		},
		body: formData.toString(),
	})

	const text = await response.text()

	// VK internal API returns HTML-wrapped JSON with <!-- prefix
	const jsonMatch = text.match(/<!json>(.+?)<!>/)
		?? text.match(/<!>({.+})/)
		?? text.match(/(\{[\s\S]*"list"\s*:\s*\[[\s\S]*\][\s\S]*\})/)

	if (!jsonMatch) {
		// Try to find raw array data
		const arrayMatch = text.match(/\[\[[-\d]+,[-\d]+,"https?:\/\/[^"]*"/)
		if (arrayMatch) {
			try {
				const start = text.indexOf(arrayMatch[0])
				const bracket = findMatchingBracket(text, start)
				const arrText = text.substring(start, bracket + 1)
				const arrays = JSON.parse(`[${arrText}]`)
				const items = arrays.map(parseAudioArray).filter((a: AudioItem) => a.url)
				return jsonResponse({ count: items.length, items }, request)
			} catch { /* fall through */ }
		}
		return jsonResponse({ error: 'Failed to parse VK response', raw: text.substring(0, 500) }, request, 502)
	}

	try {
		const data = JSON.parse(jsonMatch[1])
		const list = data.list ?? data.audios ?? []
		const items = list.map(parseAudioArray).filter((a: AudioItem) => a.url)
		return jsonResponse({ count: items.length, items }, request)
	} catch (e) {
		return jsonResponse({ error: 'JSON parse error', details: String(e) }, request, 502)
	}
}

/** Search audio */
async function handleSearch(request: Request) {
	const body = await request.json<{ remixsid: string; query: string; offset?: number }>()

	if (!body.remixsid || !body.query) {
		return jsonResponse({ error: 'remixsid and query are required' }, request, 400)
	}

	const formData = new URLSearchParams()
	formData.set('act', 'section')
	formData.set('al', '1')
	formData.set('claim', '0')
	formData.set('is_layer', '0')
	formData.set('owner_id', '0')
	formData.set('q', body.query)
	formData.set('section', 'search')

	const response = await fetch('https://vk.com/al_audio.php', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': `remixsid=${body.remixsid}`,
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'X-Requested-With': 'XMLHttpRequest',
		},
		body: formData.toString(),
	})

	const text = await response.text()

	// Extract audio arrays from response
	const items: AudioItem[] = []
	const regex = /\[[-\d]+,[-\d]+,"https?:\/\/[^"]*","[^"]*","[^"]*",\d+/g
	let match

	while ((match = regex.exec(text)) !== null) {
		try {
			const start = text.lastIndexOf('[', match.index)
			const bracket = findMatchingBracket(text, start)
			const arrText = text.substring(start, bracket + 1)
			const arr = JSON.parse(arrText)
			const audio = parseAudioArray(arr)
			if (audio.url) items.push(audio)
		} catch { continue }
	}

	return jsonResponse({ count: items.length, items }, request)
}

/** Reload audio URLs (they expire) */
async function handleReload(request: Request) {
	const body = await request.json<{ remixsid: string; ids: string[] }>()

	if (!body.remixsid || !body.ids?.length) {
		return jsonResponse({ error: 'remixsid and ids are required' }, request, 400)
	}

	const formData = new URLSearchParams()
	formData.set('act', 'reload_audio')
	formData.set('al', '1')
	formData.set('ids', body.ids.join(','))

	const response = await fetch('https://vk.com/al_audio.php', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': `remixsid=${body.remixsid}`,
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'X-Requested-With': 'XMLHttpRequest',
		},
		body: formData.toString(),
	})

	const text = await response.text()

	try {
		const jsonMatch = text.match(/<!json>(.+?)<!>/)
		if (jsonMatch) {
			const data = JSON.parse(jsonMatch[1])
			const items = (Array.isArray(data) ? data : []).map(parseAudioArray).filter((a: AudioItem) => a.url)
			return jsonResponse({ items }, request)
		}
	} catch { /* fall through */ }

	return jsonResponse({ error: 'Failed to reload', raw: text.substring(0, 300) }, request, 502)
}

function findMatchingBracket(text: string, start: number): number {
	let depth = 0
	let inString = false
	let escape = false

	for (let i = start; i < text.length; i++) {
		const ch = text[i]
		if (escape) { escape = false; continue }
		if (ch === '\\') { escape = true; continue }
		if (ch === '"') { inString = !inString; continue }
		if (inString) continue
		if (ch === '[') depth++
		if (ch === ']') { depth--; if (depth === 0) return i }
	}
	return text.length - 1
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders(request) })
		}

		const url = new URL(request.url)

		if (url.pathname === '/audios' && request.method === 'POST') {
			return handleGetAudios(request)
		}

		if (url.pathname === '/search' && request.method === 'POST') {
			return handleSearch(request)
		}

		if (url.pathname === '/reload' && request.method === 'POST') {
			return handleReload(request)
		}

		if (url.pathname === '/health') {
			return jsonResponse({ status: 'ok' }, request)
		}

		return new Response('Not Found', { status: 404, headers: corsHeaders(request) })
	},
}
