import type { BraveData } from './types';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

export async function fetchBraveSearchData(repoName: string): Promise<BraveData> {
    if (!BRAVE_API_KEY) return { matches: 0, snippets: [] };

    // Fresher results first, then broader month, then all-time
    const freshnessOptions = ['pw', 'pm', 'all'];

    for (const freshness of freshnessOptions) {
        // Broaden query for "all-time" or if no results found
        const query = (freshness === 'all')
            ? `${repoName} github`
            : `(${repoName} "AI assistant") OR (${repoName} openclaw github)`;

        console.log(`Searching Brave (${freshness}) for "${repoName}"...`);
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10` +
            (freshness !== 'all' ? `&freshness=${freshness}` : '');

        try {
            const res = await fetch(url, {
                headers: {
                    "Accept": "application/json",
                    "X-Subscription-Token": BRAVE_API_KEY
                }
            });

            if (!res.ok) {
                console.error(`Brave Search Error (${res.status}) for ${repoName}`);
                continue;
            }

            const data: any = await res.json();
            const results = data.web?.results || [];

            if (results.length > 0) {
                const total = data.web?.total || results.length;
                console.log(`  Found ${results.length} results (Total: ${total}) for ${repoName} [${freshness}]`);
                return {
                    matches: total,
                    snippets: results.map((r: any) => ({ title: r.title, description: r.description }))
                };
            }
        } catch (e) {
            console.error(`Brave Search Exception for ${repoName}:`, e);
        }
    }

    return { matches: 0, snippets: [] };
}

export async function discoverNewClones(existingRepos: string[]): Promise<string[]> {
    if (!BRAVE_API_KEY) return [];

    console.log("Using Brave Search API to discover new OpenClaw alternatives...");
    const query = '"openclaw" (fork OR clone OR alternative) site:github.com';
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&freshness=pm`;

    try {
        const res = await fetch(url, {
            headers: {
                "Accept": "application/json",
                "X-Subscription-Token": BRAVE_API_KEY
            }
        });
        if (!res.ok) throw new Error(`Brave Search HTTP error: ${res.status}`);
        const data: any = await res.json();
        const results = data.web?.results || [];

        const discovered = new Set<string>();
        const existingLower = existingRepos.map(r => r.toLowerCase());

        for (const r of results) {
            const validRepoMatch = r.url.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
            if (validRepoMatch) {
                let dRepo = validRepoMatch[1].replace(/\/$/, '').toLowerCase();
                dRepo = dRepo.split('/tree')[0].split('/issues')[0].split('/pulls')[0];
                if (!existingLower.includes(dRepo)) {
                    discovered.add(dRepo);
                }
            }
        }

        return Array.from(discovered).filter(r => !r.includes('openclaw/') && !r.includes('topics/'));
    } catch (e) {
        console.error("Brave Search discovery error:", e);
        return [];
    }
}
