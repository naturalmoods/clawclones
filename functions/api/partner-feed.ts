/**
 * Cloudflare Pages Function: /api/partner-feed
 *
 * Protects the partner feed with API key authentication.
 * API key is passed via the X-API-Key header.
 *
 * The feed data is bundled into the function at deploy time from
 * `src/data/partner-feed.json`, so it is never exposed as a public static
 * asset — the only way to read it is through this authenticated route.
 *
 * Valid API keys are stored in the PARTNER_API_KEYS environment variable
 * as comma-separated values (e.g. "key1,key2,key3").
 *
 * Set in Cloudflare Dashboard → Pages → Settings → Environment Variables:
 *   PARTNER_API_KEYS = "openclaw-live-abc123,partner2-xyz789"
 */

import feed from '../../src/data/partner-feed.json';

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

/**
 * Constant-time string comparison. Uses the Workers-native
 * crypto.subtle.timingSafeEqual when available and falls back to a manual
 * XOR loop. The length check short-circuits, which only leaks key length.
 */
function timingSafeEqual(a: string, b: string): boolean {
    const encoder = new TextEncoder();
    const aBytes = encoder.encode(a);
    const bBytes = encoder.encode(b);

    if (aBytes.byteLength !== bBytes.byteLength) return false;

    const subtle = crypto.subtle as SubtleCrypto & {
        timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean;
    };
    if (typeof subtle.timingSafeEqual === 'function') {
        return subtle.timingSafeEqual(aBytes, bBytes);
    }

    let diff = 0;
    for (let i = 0; i < aBytes.length; i++) {
        diff |= aBytes[i]! ^ bBytes[i]!;
    }
    return diff === 0;
}

export const onRequest = async (context: { request: Request; env: Env }) => {
    const { request, env } = context;

    const corsHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
        'Content-Type': 'application/json',
        // Authenticated responses must not land in shared caches.
        'Cache-Control': 'no-store',
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
    // Header only: a ?key= query parameter would leak into logs, analytics
    // and referrers.
    const providedKey = request.headers.get('X-API-Key');

    if (!providedKey) {
        return new Response(JSON.stringify({
            error: 'API key required',
            hint: 'Pass via the X-API-Key header',
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

    if (!validKeys.some((key) => timingSafeEqual(key, providedKey))) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
            status: 403,
            headers: corsHeaders,
        });
    }

    // --- Serve the feed ---
    const feedPayload = feed as PartnerFeedPayload;

    return new Response(JSON.stringify(feed), {
        status: 200,
        headers: {
            ...corsHeaders,
            'X-Feed-Updated-At': feedPayload.updated_at || 'unknown',
            'X-Feed-Generated-At': feedPayload.generated_at || 'unknown',
            'X-Feed-Stale': String(feedPayload.freshness?.is_stale === true),
            'X-Feed-Source-Age-Hours': String(feedPayload.freshness?.source_age_hours ?? 'unknown'),
        },
    });
};
