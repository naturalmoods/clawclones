import * as fs from 'fs';
import * as path from 'path';

// Load environment variables (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID)
import 'dotenv/config';

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID; // The Zone ID of your domain

interface GraphQLResponse {
    data?: {
        viewer?: {
            zones?: Array<{
                httpRequestsAdaptiveGroups?: Array<{
                    dimensions: {
                        clientRequestPath: string;
                    };
                    sum: {
                        visits: number;
                    };
                }>;
            }>;
        };
    };
    errors?: any[];
}

export async function fetchCloudflareStats() {
    // The GraphQL query is scoped by zoneTag alone; there is no account-level
    // call here, so an account id was never needed — requiring it only meant a
    // missing value silently skipped the whole analytics run.
    if (!API_TOKEN || !ZONE_ID) {
        console.warn("Missing Cloudflare credentials in .env. Skipping analytics update.");
        return;
    }

    // Query for yesterday's data (or today's up to now)
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // GraphQL query to get Visits grouped by Path
    const query = `
      query getVisitsByPath($zoneTag: string!, $date: String!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequestsAdaptiveGroups(
              limit: 500,
              filter: { date: $date }
            ) {
              dimensions {
                clientRequestPath
              }
              sum {
                visits
              }
            }
          }
        }
      }
    `;

    try {
        console.log(`Fetching Cloudflare Analytics for ${today}...`);

        const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`,
            },
            body: JSON.stringify({
                query,
                variables: {
                    zoneTag: ZONE_ID,
                    date: today
                }
            })
        });

        if (!res.ok) {
            throw new Error(`Cloudflare API responded with status: ${res.status}`);
        }

        const json = await res.json() as GraphQLResponse;

        if (json.errors) {
            console.error("Cloudflare GraphQL Errors:", json.errors);
            return;
        }

        const groups = json.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

        // Filter out paths to only get clones, vs-modes and the editorial pages
        const stats: Record<string, { type: 'clone' | 'vs' | 'page', visits: number }> = {};

        // Standalone routes worth measuring: without these the weekly report,
        // the map and the trust pages have no readership signal at all.
        const TRACKED_PAGES = ['/analysis', '/clawverse', '/about', '/faq', '/compare'];

        for (const group of groups) {
            const pathUrl = group.dimensions.clientRequestPath;
            const visits = group.sum.visits;
            const normalizedPath = pathUrl.replace(/\/$/, '') || '/';

            // Only care about /clones/*, /compare/* and the tracked standalone pages
            if (pathUrl.startsWith('/clones/') && pathUrl.length > 8) {
                const cloneId = pathUrl.replace('/clones/', '').replace(/\/$/, '');
                stats[cloneId] = { type: 'clone', visits };
            } else if (pathUrl.startsWith('/compare/') && pathUrl.includes('-vs-')) {
                const compareId = pathUrl.replace('/compare/', '').replace(/\/$/, '');
                stats[compareId] = { type: 'vs', visits };
            } else if (TRACKED_PAGES.includes(normalizedPath)) {
                stats[normalizedPath] = { type: 'page', visits };
            }
        }

        await saveStatsToFile(today, stats);

    } catch (e) {
        console.error("Failed to fetch Cloudflare stats:", e);
    }
}

async function saveStatsToFile(dateString: string, newStats: Record<string, any>) {
    // We'll save it to src/data/analytics.json to keep a historical tally
    const filePath = path.join(process.cwd(), 'src', 'data', 'analytics.json');

    let historicalData: Record<string, any> = {};
    if (fs.existsSync(filePath)) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            historicalData = JSON.parse(fileContent);
        } catch (e) { /* ignore parse error if empty */ }
    }

    historicalData[dateString] = newStats;

    // Optional: Keep only the last 30 days to prevent infinite file size
    const dates = Object.keys(historicalData).sort();
    if (dates.length > 30) {
        const toRemove = dates.slice(0, dates.length - 30);
        for (const d of toRemove) delete historicalData[d];
    }

    fs.writeFileSync(filePath, JSON.stringify(historicalData, null, 2), 'utf-8');
    console.log(`Saved Cloudflare Analytics to ${filePath}`);
}

// Allow direct execution
if (process.argv[1] === new URL(import.meta.url).pathname) {
    fetchCloudflareStats();
}
