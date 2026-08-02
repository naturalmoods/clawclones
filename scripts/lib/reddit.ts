import type { RedditData, RedditPost } from './types';
import { REDDIT_AI_KEYWORDS, REDDIT_BANNED_SUBREDDITS, REDDIT_IRRELEVANT_KEYWORDS } from './config';

/**
 * Reddit keresés az Atom RSS feed-en keresztül.
 * Nem kell API key, OAuth, vagy bármilyen regisztráció.
 * URL: https://www.reddit.com/search.rss?q=...&sort=relevance&t=month
 */
export async function fetchRedditData(query: string, limit = 25): Promise<RedditData> {
    console.log(`Searching Reddit RSS for "${query}" (past month)...`);

    const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=relevance&t=month&limit=${limit}`;
    const headers = {
        // RSS reader user agenttel nem blokkolódik, mint a scraper UA
        'User-Agent': 'Mozilla/5.0 (compatible; RSS reader; ClawClones/1.0)',
        'Accept': 'application/atom+xml, application/rss+xml, text/xml, */*'
    };

    try {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Reddit RSS HTTP error: ${res.status}`);

        const xml = await res.text();
        const posts = parseAtomFeed(xml, query);

        const currentTimestamp = Date.now() / 1000;
        const thirtyDaysAgo = currentTimestamp - (30 * 24 * 3600);

        const filtered = posts.filter((p: RedditPost) => {
            const combined = (p.title + ' ' + p.text).toLowerCase();
            const isBannedSub = REDDIT_BANNED_SUBREDDITS.some(s => p.subreddit.includes(s));
            const isIrrelevant = REDDIT_IRRELEVANT_KEYWORDS.some(kw => combined.includes(kw));
            const hasAIKeyword = REDDIT_AI_KEYWORDS.some(kw => new RegExp('\\b' + kw + '\\b', 'i').test(combined));
            const isFresh = p.created_utc >= thirtyDaysAgo;

            if (isBannedSub || isIrrelevant || !isFresh) return false;

            // Generikus neveknél AI kulcsszó kell
            const genericNames = ['nanobot', 'picoclaw', 'nanoclaw', 'zeroclaw', 'rowboat', 'moltis', 'ruvector'];
            if (genericNames.includes(p.clone.toLowerCase())) {
                return hasAIKeyword;
            }
            return true;
        });

        console.log(`  Reddit RSS: ${filtered.length} relevant posts for "${query}"`);
        return { matches: filtered.length, posts: filtered };

    } catch (e) {
        console.error(`Reddit RSS error for ${query}:`, e);
        return { matches: 0, posts: [] };
    }
}

/**
 * Atom XML feed parse-olása (Reddit RSS formátuma).
 * Vanilla regex-szel, nincs szükség külső XML parser-re.
 */
function parseAtomFeed(xml: string, query: string): RedditPost[] {
    const entries: RedditPost[] = [];

    // <entry>...</entry> blokkok kinyerése
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(xml)) !== null) {
        const block = match[1];

        const title = extractTag(block, 'title') ?? '';
        const link = extractAttr(block, 'link', 'href') ?? extractTag(block, 'link') ?? '';
        const updated = extractTag(block, 'updated') ?? '';
        const content = extractTag(block, 'content') ?? '';
        const category = extractAttr(block, 'category', 'term') ?? '';

        // Kizárjuk a subreddit linkeket – csak valódi bejegyzések kellenek
        if (!link.includes('/comments/')) continue;

        // HTML entitások dekódolása a content-ből
        const plainText = content
            .replace(/<[^>]+>/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const created_utc = updated ? new Date(updated).getTime() / 1000 : 0;
        // Olvasható dátum formátum (RSS-ből)
        const created_readable = updated
            ? new Date(updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '';

        entries.push({
            title: decodeHtmlEntities(title),
            url: link,
            score: 0,
            num_comments: 0,
            clone: query,
            subreddit: category.toLowerCase(),
            text: plainText,
            created_utc,
            created_readable
        });
    }

    return entries;
}

function extractTag(xml: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = re.exec(xml);
    return m ? m[1].trim() : null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
    const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
    const m = re.exec(xml);
    return m ? m[1].trim() : null;
}

function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
