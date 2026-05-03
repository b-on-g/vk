/**
 * Cloudflare Worker proxy for VK audio API
 * Forwards requests to VK API as POST with first-party headers + cookies
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

async function vkApi(method: string, token: string, cookies: string, params: Record<string, string | number> = {}) {
	const body = new URLSearchParams({
		...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
		access_token: token,
		v: '5.269',
		client_id: '6287487',
	})

	const headers: Record<string, string> = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Origin': 'https://vk.com',
		'Referer': 'https://vk.com/',
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
	}

	if (cookies) {
		headers['Cookie'] = cookies
	}

	const resp = await fetch(`https://api.vk.com/method/${method}`, {
		method: 'POST',
		headers,
		body: body.toString(),
	})
	return resp.json() as Promise<any>
}

/** Get user's audio list */
async function handleGetAudios(request: Request) {
	const body = await request.json<{ token: string; cookies?: string; offset?: number; count?: number }>()

	if (!body.token) {
		return jsonResponse({ error: 'token is required' }, request, 400)
	}

	const data = await vkApi('audio.get', body.token, body.cookies ?? '', {
		count: body.count ?? 200,
		offset: body.offset ?? 0,
	})

	if (data.error) {
		return jsonResponse({ error: data.error.error_msg ?? 'VK API error', code: data.error.error_code }, request, 502)
	}

	return jsonResponse(data.response, request)
}

/** Refresh audio URL (HLS expires ~60 min) */
async function handleGetById(request: Request) {
	const body = await request.json<{ token: string; cookies?: string; audios: string }>()

	if (!body.token || !body.audios) {
		return jsonResponse({ error: 'token and audios are required' }, request, 400)
	}

	const data = await vkApi('audio.getById', body.token, body.cookies ?? '', {
		audios: body.audios,
	})

	if (data.error) {
		return jsonResponse({ error: data.error.error_msg ?? 'VK API error', code: data.error.error_code }, request, 502)
	}

	return jsonResponse(data.response, request)
}

/** Search audio */
async function handleSearch(request: Request) {
	const body = await request.json<{ token: string; cookies?: string; query: string; offset?: number; count?: number }>()

	if (!body.token || !body.query) {
		return jsonResponse({ error: 'token and query are required' }, request, 400)
	}

	const data = await vkApi('audio.search', body.token, body.cookies ?? '', {
		q: body.query,
		count: body.count ?? 100,
		offset: body.offset ?? 0,
		sort: 2,
	})

	if (data.error) {
		return jsonResponse({ error: data.error.error_msg ?? 'VK API error', code: data.error.error_code }, request, 502)
	}

	return jsonResponse(data.response, request)
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			if (request.method === 'OPTIONS') {
				return new Response(null, { status: 204, headers: corsHeaders(request) })
			}

			const url = new URL(request.url)

			if (url.pathname === '/audios' && request.method === 'POST') {
				return await handleGetAudios(request)
			}

			if (url.pathname === '/search' && request.method === 'POST') {
				return await handleSearch(request)
			}

			if (url.pathname === '/getById' && request.method === 'POST') {
				return await handleGetById(request)
			}

			if (url.pathname === '/health') {
				return jsonResponse({ status: 'ok' }, request)
			}

			return new Response('Not Found', { status: 404, headers: corsHeaders(request) })
		} catch (e) {
			return jsonResponse({ error: 'Worker error', details: String(e) }, request, 500)
		}
	},
}
