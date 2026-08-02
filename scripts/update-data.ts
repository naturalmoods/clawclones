import * as path from 'path';
import 'dotenv/config';
import { OUTPUT_DIR } from './lib/config';
import {
    loadProjects,
    reposWithStatus,
    saveProjects,
    setStatus,
} from './lib/projects';
import { ensureDirectories, retry, getSafeFileName } from './lib/utils';
import { fetchGitHubData } from './lib/github';
import { fetchRedditData } from './lib/reddit';
import { fetchBraveSearchData } from './lib/brave';
import {
    DEFAULT_SOURCE_WINDOW,
    generateAIJSON,
    normalizeCloneData,
} from './lib/ai-provider';
import {
    loadJSON,
    saveJSON,
    updateHistoricalStars,
    cleanupObsoleteFiles
} from './lib/storage';

const AI_SOURCE_WINDOW = DEFAULT_SOURCE_WINDOW;

function parseTargetRepos(): string[] {
    const args = process.argv.slice(2);
    const cliValueIndex = args.findIndex(arg => arg === '--repos');
    const cliValue = cliValueIndex >= 0 ? args[cliValueIndex + 1] : undefined;
    const inlineArg = args.find(arg => arg.startsWith('--repos='));
    const rawValue = process.env.TARGET_REPOS || cliValue || inlineArg?.split('=')[1] || '';

    return [...new Set(
        rawValue
            .split(/[\s,]+/)
            .map(repo => repo.trim())
            .filter(Boolean)
    )];
}

async function processRepo(repo: string) {
    const safeName = getSafeFileName(repo);
    const filePath = path.join(OUTPUT_DIR, `${safeName}.json`);
    const existingData = loadJSON(filePath);
    const isNew = !existingData;

    // 1. Fetch data from sources (Parallelized for each repo)
    const [github, reddit, brave] = await Promise.all([
        retry(() => fetchGitHubData(repo)),
        retry(() => fetchRedditData(safeName)),
        retry(() => fetchBraveSearchData(safeName))
    ]);
    const now = new Date().toISOString();

    let finalStars = 0;

    // 2. Process with AI or Fallback
    if (github && github.repoInfo && !github.repoInfo.message?.includes("Not Found")) {
        const combinedData = { ...github, reddit, brave };
        const aiGeneratedJSON = await generateAIJSON(repo, combinedData);

        if (aiGeneratedJSON) {
            if (aiGeneratedJSON.is_valid_clone === false) {
                console.log(`AI determined ${repo} is NOT a valid AI clone. Mark for removal.`);
                return { repo, isValid: false, isNew, usedFallback: false };
            }

            finalStars = parseInt(github.repoInfo.stargazers_count) || parseInt(aiGeneratedJSON.github_stars) || 0;
            delete aiGeneratedJSON.is_valid_clone;

            const normalizedData = normalizeCloneData(aiGeneratedJSON, {
                repo,
                existingData,
                refreshMode: 'rewrite',
                changeReason: isNew
                    ? 'Initial AI analysis for newly tracked clone.'
                    : 'Scheduled AI re-analysis after source refresh.',
                sourceWindow: AI_SOURCE_WINDOW,
                measured: {
                    github_stars: finalStars,
                    reddit_mentions: reddit.matches,
                    web_mentions: brave.matches,
                    latest_release: github.latestRelease,
                    language: github.repoInfo.language,
                    license_type: github.licenseType,
                    last_commit_at: github.lastCommitAt,
                    contributors_count: github.contributorsCount,
                    open_issues_count: github.openIssuesCount,
                    release_cadence_days: github.releaseCadenceDays,
                    last_updated: now,
                },
            });

            saveJSON(filePath, normalizedData);
            console.log(`Successfully updated ${filePath}`);
            updateHistoricalStars(repo, finalStars);

            return { repo, isValid: true, stars: finalStars, isNew, usedFallback: false };
        }
    }

    // 3. Fallback Logic
    console.warn(`Using fallback logic for ${repo}`);
    if (existingData) {
        finalStars = existingData.github_stars;
        if (github?.repoInfo?.stargazers_count) {
            finalStars = parseInt(github.repoInfo.stargazers_count) || existingData.github_stars;
        }
        updateHistoricalStars(repo, finalStars);

        const normalizedData = normalizeCloneData(existingData, {
            repo,
            existingData,
            refreshMode: 'refresh',
            changeReason: 'AI generation unavailable; preserved prior AI fields and refreshed measured signals.',
            sourceWindow: AI_SOURCE_WINDOW,
            measured: {
                github_stars: finalStars,
                reddit_mentions: reddit.matches,
                web_mentions: brave.matches,
                latest_release: github?.latestRelease,
                language: github?.repoInfo?.language,
                license_type: github?.licenseType,
                last_commit_at: github?.lastCommitAt,
                contributors_count: github?.contributorsCount,
                open_issues_count: github?.openIssuesCount,
                release_cadence_days: github?.releaseCadenceDays,
                last_updated: now,
            },
        });

        saveJSON(filePath, normalizedData);

        return { repo, isValid: true, stars: finalStars, isNew, usedFallback: true };
    }

    console.warn(`Skipping ${repo}: AI generation failed and no existing profile is available.`);
    return { repo, isValid: true, isNew, usedFallback: true };
}

async function main() {
    ensureDirectories();

    // 1. Load the tracked slice of the project list
    let projects = loadProjects();
    const repos = reposWithStatus(projects, 'tracked');

    cleanupObsoleteFiles(repos);

    const args = process.argv.slice(2);
    const targetRepos = parseTargetRepos();
    const isTargetedRun = targetRepos.length > 0 || args.includes('--targeted');
    const reposToProcess = isTargetedRun
        ? repos.filter(repo => targetRepos.includes(repo))
        : repos;

    if (isTargetedRun) {
        const missingTargets = targetRepos.filter(repo => !repos.includes(repo));
        if (missingTargets.length > 0) {
            console.warn(`Skipping unknown repos: ${missingTargets.join(', ')}`);
        }
        console.log(`Running targeted update for ${reposToProcess.length} repo(s).`);
    }

    if (reposToProcess.length === 0) {
        console.log("No repos selected for update.");
        return;
    }

    // 3. Fetch Repo Data
    const repoResults = [];
    for (const repo of reposToProcess) {
        repoResults.push(await processRepo(repo));
    }

    if (repoResults.length > 0 && repoResults.every(result => result.usedFallback)) {
        console.error(`AI generation failed for all ${repoResults.length} processed repos; fallback data was preserved.`);
        process.exitCode = 1;
    }

    // 4. Archive anything the AI judged not to be a clone. Archiving rather
    // than deleting the line keeps discovery from proposing it again.
    const invalidRepos = repoResults.filter(r => r && !r.isValid).map(r => r!.repo);
    if (invalidRepos.length > 0) {
        for (const repo of invalidRepos) {
            projects = setStatus(projects, repo, 'archived');
            console.log(`Archived ${repo}: AI determined it is not a valid clone.`);
        }
        saveProjects(projects);
    }

    console.log("Update complete.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
