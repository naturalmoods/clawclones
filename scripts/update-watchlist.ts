import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import { WATCHLIST_OUTPUT_DIR, OUTPUT_DIR } from './lib/config';
import { evaluatePromotion, promotionGapReasons } from '../src/lib/watchlist';
import { loadProjects, saveProjects, setStatus } from './lib/projects';
import { DEFAULT_SOURCE_WINDOW, normalizeCloneData } from './lib/ai-provider';
import { cleanupObsoleteFiles, loadJSON, saveJSON } from './lib/storage';
import { isValidToken, getSafeFileName } from './lib/utils';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_AUTH_TOKEN = isValidToken(GITHUB_TOKEN) ? GITHUB_TOKEN : undefined;

interface WatchlistEntry {
    repo: string;
    added: string; // ISO date
}

async function fetchGitHubBasicInfo(repo: string) {
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ClawClones-Watchlist'
    };
    if (GITHUB_AUTH_TOKEN) {
        headers['Authorization'] = `token ${GITHUB_AUTH_TOKEN}`;
    }

    try {
        const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        if (!repoRes.ok) {
            console.error(`GitHub API error for ${repo}: ${repoRes.status}`);
            return null;
        }
        const repoData = await repoRes.json();

        // Fetch latest release
        let latestRelease = null;
        const releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
        if (releaseRes.ok) {
            const releaseJson = await releaseRes.json();
            latestRelease = {
                version: releaseJson.tag_name,
                date: releaseJson.published_at,
                url: releaseJson.html_url
            };
        }

        return {
            stars: repoData.stargazers_count || 0,
            language: repoData.language || 'Unknown',
            description: repoData.description || '',
            created_at: repoData.created_at,
            updated_at: repoData.updated_at,
            pushed_at: repoData.pushed_at,
            open_issues: repoData.open_issues_count || 0,
            forks: repoData.forks_count || 0,
            latestRelease
        };
    } catch (error) {
        console.error(`Error fetching GitHub data for ${repo}:`, error);
        return null;
    }
}

function checkPromotionEligibility(
    data: any,
    addedDate: string
): { eligible: boolean; reasons: string[] } {
    const { eligible, criteria } = evaluatePromotion({
        stars: data.github_stars,
        sentiment: data.community_sentiment,
        since: addedDate,
    });

    return { eligible, reasons: promotionGapReasons(criteria) };
}

async function processWatchlistRepo(repo: string, addedDate: string) {
    const safeName = getSafeFileName(repo);
    const filePath = path.join(WATCHLIST_OUTPUT_DIR, `${safeName}.json`);

    console.log(`Processing watchlist repo: ${repo}`);

    const github = await fetchGitHubBasicInfo(repo);
    if (!github) {
        console.warn(`Could not fetch data for ${repo}, skipping.`);
        return null;
    }

    const existingData = loadJSON(filePath);
    const now = new Date().toISOString();

    // Determine health status based on activity
    const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(github.pushed_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    let healthStatus: 'healthy' | 'warning' | 'abandoned' = 'healthy';
    if (daysSinceUpdate > 180) healthStatus = 'abandoned';
    else if (daysSinceUpdate > 60) healthStatus = 'warning';

    // Basic sentiment estimation from available signals
    const baseSentiment = Math.min(100, Math.max(10,
        Math.floor(20 + (github.stars / 100) + (github.forks * 2) - (github.open_issues / 5))
    ));

    const cloneSeed = {
        id: repo,
        name: safeName.charAt(0).toUpperCase() + safeName.slice(1),
        language: github.language,
        vibe_summary: existingData?.vibe_summary || github.description || `${safeName} - a new project under observation.`,
        health_status: healthStatus,
        github_stars: github.stars,
        metrics: existingData?.metrics || {
            boot_time_ms: 0,
            memory_mb: 0,
            security_score: 0,
        },
        radar_chart: existingData?.radar_chart || {
            sandboxing: 5,
            api_security: 5,
            network_isolation: 5,
            telemetry_safety: 5,
            shell_access_risk: 5,
        },
        tags: existingData?.tags || [safeName.replace('claw', ''), 'watchlist', 'new'],
        community_sentiment: existingData?.community_sentiment || baseSentiment,
        reddit_mentions: existingData?.reddit_mentions || 0,
        web_mentions: existingData?.web_mentions || 0,
        best_for: existingData?.best_for || [],
        avoid_if: existingData?.avoid_if || [],
        deployment_target: existingData?.deployment_target || [],
        local_first: existingData?.local_first ?? null,
        cloud_dependency: existingData?.cloud_dependency || 'unknown',
        setup_difficulty: existingData?.setup_difficulty || 'unknown',
        privacy_posture: existingData?.privacy_posture || 'unknown',
        multi_user: existingData?.multi_user ?? null,
        plugin_ecosystem: existingData?.plugin_ecosystem || 'unknown',
        license_type: existingData?.license_type ?? null,
        operational_risk: existingData?.operational_risk || 'unknown',
        openclaw_advantages: existingData?.openclaw_advantages || [],
        openclaw_disadvantages: existingData?.openclaw_disadvantages || [],
        confidence_summary: existingData?.confidence_summary || 'Watchlist profiles use lightweight signals until a full AI analysis is available.',
        evidence_confidence: existingData?.evidence_confidence || 20,
        overview_markdown: existingData?.overview_markdown || '',
        latest_release: github.latestRelease || undefined,
        last_updated: now,
        watchlist_added: addedDate,
        promotion_status: 'observing' as 'observing' | 'candidate' | 'promoted',
    };

    const cloneData = {
        ...normalizeCloneData(cloneSeed, {
            repo,
            existingData,
            refreshMode: 'refresh',
            changeReason: 'Watchlist refresh using lightweight repository signals.',
            sourceWindow: `${DEFAULT_SOURCE_WINDOW}; watchlist mode without full AI rewrite`,
            measured: {
                github_stars: github.stars,
                reddit_mentions: existingData?.reddit_mentions || 0,
                web_mentions: existingData?.web_mentions || 0,
                latest_release: github.latestRelease || undefined,
                language: github.language,
                last_updated: now,
            },
        }),
        watchlist_added: addedDate,
        promotion_status: 'observing' as 'observing' | 'candidate' | 'promoted',
    };

    // Check promotion eligibility
    const { eligible, reasons } = checkPromotionEligibility(cloneData, addedDate);
    if (eligible) {
        cloneData.promotion_status = 'candidate';
        console.log(`✨ ${repo} is a PROMOTION CANDIDATE!`);
    } else {
        console.log(`   ${repo} not yet eligible: ${reasons.join(', ')}`);
    }

    saveJSON(filePath, cloneData);
    return { repo, data: cloneData };
}

/**
 * Promotion is now: move the content, flip one word, drop the watchlist copy.
 * The previous version left the watchlist file behind marked `promoted` and
 * relied on the homepage to filter it out — which is how two projects ended up
 * with both a profile and a radar entry.
 */
async function promoteCandidate(repo: string) {
    const safeName = getSafeFileName(repo);
    const watchlistPath = path.join(WATCHLIST_OUTPUT_DIR, `${safeName}.json`);
    const clonePath = path.join(OUTPUT_DIR, `${safeName}.json`);

    const watchlistData = loadJSON(watchlistPath);
    if (!watchlistData) return false;

    const { watchlist_added, promotion_status, ...cloneData } = watchlistData;
    saveJSON(clonePath, cloneData);

    saveProjects(setStatus(loadProjects(), repo, 'tracked'));
    fs.rmSync(watchlistPath, { force: true });

    console.log(`🎉 ${repo} has been PROMOTED to the main clone tracker!`);
    return true;
}

async function main() {
    console.log("==========================================");
    console.log("Starting WATCHLIST update...");
    console.log("==========================================");

    // Ensure output directory exists
    if (!fs.existsSync(WATCHLIST_OUTPUT_DIR)) {
        fs.mkdirSync(WATCHLIST_OUTPUT_DIR, { recursive: true });
    }

    const watchlistEntries: WatchlistEntry[] = loadProjects()
        .filter(project => project.status === 'watching')
        .map(project => ({ repo: project.repo, added: project.since || new Date().toISOString() }));

    if (watchlistEntries.length === 0) {
        console.log('No repos are being watched. Add an entry to projects.json with "status": "watching".');
        return;
    }

    // A project holds exactly one status, so nothing can be watched and tracked
    // at the same time — the old duplicate check is gone with the second list.
    cleanupObsoleteFiles(watchlistEntries.map(entry => entry.repo), WATCHLIST_OUTPUT_DIR);

    const promotionQueue: string[] = [];

    for (const entry of watchlistEntries) {
        const result = await processWatchlistRepo(entry.repo, entry.added);
        if (result && (result.data.promotion_status as string) === 'candidate') {
            promotionQueue.push(result.repo);
        }
    }

    // Auto-promote candidates (but log it for awareness)
    if (promotionQueue.length > 0) {
        console.log("\n==========================================");
        console.log(`${promotionQueue.length} repos ready for promotion:`);
        promotionQueue.forEach(r => console.log(`  - ${r}`));
        console.log("==========================================");

        // Check if auto-promote is enabled via env var
        if (process.env.WATCHLIST_AUTO_PROMOTE === 'true') {
            for (const repo of promotionQueue) {
                await promoteCandidate(repo);
            }
        } else {
            console.log("Auto-promote disabled. Set WATCHLIST_AUTO_PROMOTE=true to enable.");
            console.log("Or run: npx tsx scripts/promote-watchlist.ts <repo>");
        }
    }

    console.log("\n==========================================");
    console.log("Watchlist update complete!");
    console.log("==========================================");
}

main().catch(console.error);
