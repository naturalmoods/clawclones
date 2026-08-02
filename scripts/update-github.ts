import * as path from 'path';
import 'dotenv/config';
import { OUTPUT_DIR } from './lib/config';
import { loadProjects, reposWithStatus } from './lib/projects';
import { fetchGitHubData } from './lib/github';
import { loadJSON, saveJSON, updateHistoricalStars } from './lib/storage';

async function run() {
    console.log('==========================================');
    console.log('Starting lightweight GitHub updates...');
    console.log('==========================================');

    const trackedRepos = reposWithStatus(loadProjects(), 'tracked');

    for (const repo of trackedRepos) {
        const repoSlug = repo.split('/').pop() || '';
        const filePath = path.join(OUTPUT_DIR, `${repoSlug}.json`);
        const existingData = loadJSON(filePath);

        if (!existingData) {
            console.log(`Skipping ${repo} (no existing JSON found). Run full update-data first.`);
            continue;
        }

        const github = await fetchGitHubData(repo);
        if (!github) continue;

        const stars = github.repoInfo.stargazers_count;
        if (typeof stars === 'number') {
            existingData.github_stars = stars;
            updateHistoricalStars(repo, stars);
        }

        if (github.latestRelease) existingData.latest_release = github.latestRelease;
        existingData.license_type = github.licenseType;
        existingData.last_commit_at = github.lastCommitAt;
        existingData.contributors_count = github.contributorsCount;
        existingData.open_issues_count = github.openIssuesCount;
        existingData.release_cadence_days = github.releaseCadenceDays;
        existingData.last_updated = new Date().toISOString();
        saveJSON(filePath, existingData);
        console.log(`Successfully updated ${repoSlug}.json`);
    }

    console.log('==========================================');
    console.log('Lightweight GitHub update finished!');
    console.log('==========================================');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
