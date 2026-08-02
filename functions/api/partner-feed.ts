/**
 * Cloudflare Pages Function: /api/partner-feed
 * 
 * Protects the partner feed with API key authentication.
 * API key is passed via ?key= query parameter or X-API-Key header.
 * 
 * Valid API keys are stored in the PARTNER_API_KEYS environment variable
 * as comma-separated values (e.g. "key1,key2,key3").
 * 
 * Set in Cloudflare Dashboard → Pages → Settings → Environment Variables:
 *   PARTNER_API_KEYS = "openclaw-live-abc123,partner2-xyz789"
 */

interface Env {
    PARTNER_API_KEYS: string;
}

interface PartnerFeedPayload {
    updated_at?: string;
    generated_at?: string;
    freshness?: {
        is_stale?: boolean;
        source_age_hours?: number;
    };
}

export const onRequest = async (context: { request: Request; env: Env }) => {
    const { request, env } = context;

    // --- CORS Headers ---
    const corsHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only allow GET
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: corsHeaders,
        });
    }

    // --- API Key Validation ---
    const url = new URL(request.url);
    const apiKeyFromQuery = url.searchParams.get('key');
    const apiKeyFromHeader = request.headers.get('X-API-Key');
    const providedKey = apiKeyFromQuery || apiKeyFromHeader;

    if (!providedKey) {
        return new Response(JSON.stringify({
            error: 'API key required',
            hint: 'Pass via ?key=YOUR_KEY or X-API-Key header',
            docs: 'https://clawclones.com/about'
        }), {
            status: 401,
            headers: corsHeaders,
        });
    }

    // Parse allowed keys from env
    const validKeys = (env.PARTNER_API_KEYS || '').split(',').map((k: string) => k.trim()).filter(Boolean);

    if (validKeys.length === 0) {
        console.error('PARTNER_API_KEYS environment variable is not configured');
        return new Response(JSON.stringify({ error: 'Service configuration error' }), {
            status: 500,
            headers: corsHeaders,
        });
    }

    if (!validKeys.includes(providedKey)) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
            status: 403,
            headers: corsHeaders,
        });
    }

    // --- Serve the feed ---
    // The static JSON file is at /api/partner-feed.json (generated at build time)
    try {
        const feedUrl = new URL('/api/partner-feed.json', request.url);
        const feedResponse = await fetch(feedUrl.toString());

        if (!feedResponse.ok) {
            return new Response(JSON.stringify({ error: 'Feed data not available' }), {
                status: 503,
                headers: corsHeaders,
            });
        }

        const feedData = await feedResponse.text();
        let feedPayload: PartnerFeedPayload;

        try {
            feedPayload = JSON.parse(feedData) as PartnerFeedPayload;
        } catch {
            return new Response(JSON.stringify({ error: 'Feed data is invalid' }), {
                status: 503,
                headers: corsHeaders,
            });
        }

        return new Response(feedData, {
            status: 200,
            headers: {
                ...corsHeaders,
                'X-Partner': providedKey.split('-')[0] || 'unknown',
                'X-Feed-Updated-At': feedPayload.updated_at || 'unknown',
                'X-Feed-Generated-At': feedPayload.generated_at || 'unknown',
                'X-Feed-Stale': String(feedPayload.freshness?.is_stale === true),
                'X-Feed-Source-Age-Hours': String(feedPayload.freshness?.source_age_hours ?? 'unknown'),
            },
        });
    } catch {
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: corsHeaders,
        });
    }
};
