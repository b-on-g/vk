/**
 * Cloudflare Worker proxy for VK audio API
 * Uses VK's first-party access_token to call audio.* methods
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

async function vkApi(method: string, token: string, params: Record<string, string | number> = {}) {
	const query = new URLSearchParams({
		...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
		access_token: token,
		v: '5.131',
	})

	const resp = await fetch(`https://api.vk.com/method/${method}?${query}`)
	return resp.json() as Promise<any>
}

/** Get user's audio list */
async function handleGetAudios(request: Request) {
	const body = await request.json<{ token: string; offset?: number; count?: number }>()

	if (!body.token) {
		return jsonResponse({ error: 'token is required' }, request, 400)
	}

	const data = await vkApi('audio.get', body.token, {
		count: body.count ?? 200,
		offset: body.offset ?? 0,
	})

	if (data.error) {
		return jsonResponse({ error: data.error.error_msg ?? 'VK API error', code: data.error.error_code }, request, 502)
	}

	return jsonResponse(data.response, request)
}

/** Search audio */
async function handleSearch(request: Request) {
	const body = await request.json<{ token: string; query: string; offset?: number; count?: number }>()

	if (!body.token || !body.query) {
		return jsonResponse({ error: 'token and query are required' }, request, 400)
	}

	const data = await vkApi('audio.search', body.token, {
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

			if (url.pathname === '/health') {
				return jsonResponse({ status: 'ok' }, request)
			}

			return new Response('Not Found', { status: 404, headers: corsHeaders(request) })
		} catch (e) {
			return jsonResponse({ error: 'Worker error', details: String(e) }, request, 500)
		}
	},
}
