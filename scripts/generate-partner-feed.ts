/**
 * generate-partner-feed.ts
 * 
 * Generates a static JSON feed for partner sites (e.g. OpenClaw).
 * Contains: ecosystem stats, trending clone, hot VS matchup.
 * 
 * Run: npx tsx scripts/generate-partner-feed.ts
 * Output: src/data/partner-feed.json — bundled into the Cloudflare Function
 * (functions/api/partner-feed.ts) at deploy time; deliberately kept out of
 * public/ so the API key check cannot be bypassed via the static asset.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const CONTENT_DIR = path.join(__dirname, '..', 'src', 'content', 'clones');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'partner-feed.json');

interface CloneData {
    id: string;
    name: string;
    language: string;
    github_stars: number;
    community_sentiment: number;
    reddit_mentions: number;
    web_mentions: number;
    vibe_summary: string;
    health_status: string;
    latest_release?: {
        version: string;
        date: string;
        url: string;
    } | null;
    last_updated: string;
}

interface SourceFreshness {
    updated_at: string | null;
    age_hours: number | null;
}

interface PartnerFeedFreshness {
    updated_at: string;
    generated_at: string;
    source_age_hours: number;
    stale_threshold_hours: number;
    is_stale: boolean;
    sources: {
        clones: SourceFreshness;
        history: SourceFreshness;
        analytics: SourceFreshness;
    };
}

const DEFAULT_MAX_SOURCE_AGE_HOURS = 24 * 14;

function loadJSON(filePath: string): any {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return null;
    }
}

function parseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDayEndTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }

    return parseTimestamp(`${value}T23:59:59.999Z`);
}

function getNewestDate(dates: Array<Date | null>): Date | null {
    const validDates = dates.filter((date): date is Date => Boolean(date));
    if (validDates.length === 0) {
        return null;
    }

    return new Date(Math.max(...validDates.map((date) => date.getTime())));
}

function getAgeHours(now: Date, updatedAt: Date | null): number | null {
    if (!updatedAt) {
        return null;
    }

    const diffMs = Math.max(0, now.getTime() - updatedAt.getTime());
    return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
}

function getLatestCloneUpdatedAt(clones: CloneData[]): Date | null {
    return getNewestDate(clones.map((clone) => parseTimestamp(clone.last_updated)));
}

function getLatestHistoryUpdatedAt(historyData: Record<string, any>): Date | null {
    const latestDates = Object.values(historyData)
        .flatMap((entries) => Array.isArray(entries) ? entries : [])
        .map((entry) => parseDayEndTimestamp(entry?.date));

    return getNewestDate(latestDates);
}

function getLatestAnalyticsUpdatedAt(analyticsData: Record<string, any>): Date | null {
    return getNewestDate(Object.keys(analyticsData).map((date) => parseDayEndTimestamp(date)));
}

function buildSourceFreshness(now: Date, updatedAt: Date | null): SourceFreshness {
    return {
        updated_at: updatedAt?.toISOString() || null,
        age_hours: getAgeHours(now, updatedAt),
    };
}

function getPartnerFeedFreshness(
    now: Date,
    clones: CloneData[],
    analyticsData: Record<string, any>,
    historyData: Record<string, any>,
): PartnerFeedFreshness {
    const clonesUpdatedAt = getLatestCloneUpdatedAt(clones);
    const analyticsUpdatedAt = getLatestAnalyticsUpdatedAt(analyticsData);
    const historyUpdatedAt = getLatestHistoryUpdatedAt(historyData);
    const sourceDates = [clonesUpdatedAt, analyticsUpdatedAt, historyUpdatedAt].filter(
        (date): date is Date => Boolean(date),
    );

    if (sourceDates.length === 0) {
        throw new Error('Unable to determine source freshness for partner feed');
    }

    const primarySourceDates = [clonesUpdatedAt, historyUpdatedAt].filter(
        (date): date is Date => Boolean(date),
    );
    const latestPrimarySourceDate = primarySourceDates.length > 0
        ? new Date(Math.max(...primarySourceDates.map((date) => date.getTime())))
        : new Date(Math.max(...sourceDates.map((date) => date.getTime())));
    const parsedThreshold = Number.parseInt(
        process.env.PARTNER_FEED_MAX_SOURCE_AGE_HOURS || String(DEFAULT_MAX_SOURCE_AGE_HOURS),
        10,
    );
    const staleThresholdHours = Number.isFinite(parsedThreshold)
        ? parsedThreshold
        : DEFAULT_MAX_SOURCE_AGE_HOURS;
    const sourceAgeHours = getAgeHours(now, latestPrimarySourceDate) ?? 0;

    return {
        updated_at: latestPrimarySourceDate.toISOString(),
        generated_at: now.toISOString(),
        source_age_hours: sourceAgeHours,
        stale_threshold_hours: staleThresholdHours,
        is_stale: sourceAgeHours > staleThresholdHours,
        sources: {
            clones: buildSourceFreshness(now, clonesUpdatedAt),
            history: buildSourceFreshness(now, historyUpdatedAt),
            analytics: buildSourceFreshness(now, analyticsUpdatedAt),
        },
    };
}

function getStarsGrowth7d(historyData: any, repoKey: string): number {
    const entries = historyData?.[repoKey];
    if (!entries || entries.length < 2) return 0;

    // Filter valid entries (stars > 0)
    const valid = entries.filter((e: any) => e.stars > 0);
    if (valid.length < 2) return 0;

    const latest = valid[valid.length - 1];
    // Find entry ~7 days ago
    const sevenDaysAgo = valid.find((e: any, i: number) => i >= valid.length - 8 && e.stars > 0);

    if (!sevenDaysAgo || !latest) return 0;
    return latest.stars - sevenDaysAgo.stars;
}

function main() {
    // --- Load all clone data ---
    const cloneFiles = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json'));
    const clones: CloneData[] = cloneFiles.map(f => loadJSON(path.join(CONTENT_DIR, f))).filter(Boolean);

    if (clones.length === 0) {
        console.error('No clone data found!');
        process.exit(1);
    }

    // --- Load analytics & history ---
    const analyticsData = loadJSON(path.join(DATA_DIR, 'analytics.json')) || {};
    const historyData = loadJSON(path.join(DATA_DIR, 'history.json')) || {};
    const freshness = getPartnerFeedFreshness(new Date(), clones, analyticsData, historyData);

    // === 1. ECOSYSTEM STATS ===
    const totalStars = clones.reduce((sum, c) => sum + (c.github_stars || 0), 0);
    const languages = clones.reduce((acc, c) => {
        acc[c.language] = (acc[c.language] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const mostActiveLanguage = Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

    // Top clone by stars
    const topClone = clones.reduce((prev, curr) => (curr.github_stars > prev.github_stars) ? curr : prev, clones[0]);

    // Average sentiment
    const avgSentiment = Math.round(clones.reduce((sum, c) => sum + (c.community_sentiment || 0), 0) / clones.length);

    const ecosystem = {
        total_clones: clones.length,
        total_stars: totalStars,
        total_stars_formatted: totalStars >= 1000 ? (totalStars / 1000).toFixed(1) + 'k' : String(totalStars),
        most_active_language: mostActiveLanguage,
        language_breakdown: languages,
        avg_sentiment: avgSentiment,
        top_clone: {
            name: topClone.name,
            stars: topClone.github_stars,
            language: topClone.language,
            url: `https://clawclones.com/clones/${topClone.id || topClone.name.toLowerCase()}`
        }
    };

    // === 2. TRENDING CLONE ===
    // Find clone with highest 7-day star growth
    let bestGrowth = 0;
    let trendingClone = clones[0];
    let trendingGrowth = 0;

    for (const clone of clones) {
        // Try to find matching history key
        const possibleKeys = Object.keys(historyData).filter(k =>
            k.toLowerCase().includes(clone.name.toLowerCase().split('/').pop()!) ||
            k.toLowerCase().includes((clone.id || '').toLowerCase())
        );

        for (const key of possibleKeys) {
            const growth = getStarsGrowth7d(historyData, key);
            if (growth > bestGrowth) {
                bestGrowth = growth;
                trendingClone = clone;
                trendingGrowth = growth;
            }
        }
    }

    const trending = {
        name: trendingClone.name,
        stars: trendingClone.github_stars,
        stars_growth_7d: trendingGrowth,
        language: trendingClone.language,
        sentiment: trendingClone.community_sentiment,
        vibe_summary: trendingClone.vibe_summary,
        health: trendingClone.health_status,
        latest_version: trendingClone.latest_release?.version || null,
        url: `https://clawclones.com/clones/${trendingClone.id || trendingClone.name.toLowerCase()}`
    };

    // === 3. HOT VS MATCHUP ===
    // Find the VS comparison with the most visits in the latest analytics day
    const dates = Object.keys(analyticsData).sort((a, b) => b.localeCompare(a));
    let hotVs = {
        clone_a: '',
        clone_b: '',
        visits: 0,
        url: ''
    };

    // Aggregate last 7 days of VS data for more reliable "hot" pick
    const vsAggregated: Record<string, number> = {};
    const recentDates = dates.slice(0, 7);

    for (const date of recentDates) {
        const dayData = analyticsData[date] as Record<string, any>;
        for (const [key, value] of Object.entries(dayData)) {
            if (value.type === 'vs' && value.visits > 0) {
                vsAggregated[key] = (vsAggregated[key] || 0) + value.visits;
            }
        }
    }

    const topVsEntry = Object.entries(vsAggregated).sort((a, b) => b[1] - a[1])[0];

    if (topVsEntry) {
        const [vsKey, visits] = topVsEntry;
        const parts = vsKey.split('-vs-');
        if (parts.length === 2) {
            // Try to resolve display names from clone data
            const cloneA = clones.find(c =>
                c.name.toLowerCase().split('/').pop() === parts[0].toLowerCase() ||
                (c.id || '').toLowerCase() === parts[0].toLowerCase()
            );
            const cloneB = clones.find(c =>
                c.name.toLowerCase().split('/').pop() === parts[1].toLowerCase() ||
                (c.id || '').toLowerCase() === parts[1].toLowerCase()
            );

            hotVs = {
                clone_a: cloneA?.name || parts[0],
                clone_b: cloneB?.name || parts[1],
                visits: visits,
                url: `https://clawclones.com/compare/${vsKey}`
            };
        }
    }

    // === ASSEMBLE FINAL FEED ===
    const feed = {
        brand: {
            name: 'ClawClones Ecosystem Tracker',
            url: 'https://clawclones.com',
            description: 'Discover, compare and track the open-source OpenClaw AI ecosystem.'
        },
        ecosystem,
        trending,
        hot_vs: hotVs,
        updated_at: freshness.updated_at,
        generated_at: freshness.generated_at,
        freshness
    };

    if (freshness.is_stale) {
        console.warn(
            `Partner feed source data is stale (${freshness.source_age_hours}h old; threshold ${freshness.stale_threshold_hours}h), generating latest available feed anyway.`,
        );
    }

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(feed, null, 2));
    console.log(`✅ Partner feed generated → ${OUTPUT_PATH}`);
    console.log(`   Ecosystem: ${ecosystem.total_clones} clones, ${ecosystem.total_stars_formatted} stars`);
    console.log(`   Trending: ${trending.name} (+${trending.stars_growth_7d} stars/7d)`);
    console.log(`   Hot VS: ${hotVs.clone_a} vs ${hotVs.clone_b} (${hotVs.visits} visits/7d)`);
    console.log(`   Freshness: source=${freshness.updated_at}, age=${freshness.source_age_hours}h, stale=${freshness.is_stale}`);
}

main();
