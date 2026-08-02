import type { GitHubData } from './types';
import { isValidToken } from './utils';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_AUTH_TOKEN = isValidToken(GITHUB_TOKEN) ? GITHUB_TOKEN : undefined;

function getContributorCount(response: Response, contributors: unknown): number | null {
    if (!Array.isArray(contributors)) return null;

    const lastPage = response.headers.get('link')?.match(/<[^>]*[?&]page=(\d+)[^>]*>; rel="last"/)?.[1];
    return lastPage ? Number(lastPage) : contributors.length;
}

function getReleaseCadenceDays(releases: unknown): number | null {
    if (!Array.isArray(releases)) return null;

    const dates = releases
        .map((release: any) => Date.parse(release.published_at))
        .filter(Number.isFinite)
        .sort((a, b) => b - a);

    if (dates.length < 2) return null;

    const intervals = dates.slice(1).map((date, index) => (dates[index] - date) / 86_400_000);
    return Math.round(intervals.reduce((total, days) => total + days, 0) / intervals.length);
}

export async function fetchGitHubData(repo: string): Promise<GitHubData | null> {
    console.log(`Fetching data for ${repo}...`);
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'ClawClones-Aggregator',
    };

    if (GITHUB_AUTH_TOKEN) {
        headers.Authorization = `token ${GITHUB_AUTH_TOKEN}`;
    }

    try {
        const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        if (!repoRes.ok) {
            console.error(`GitHub API error for ${repo}: ${repoRes.status}`);
            return null;
        }
        const repoData: any = await repoRes.json();

        const [readmeRes, commitsRes, releaseRes, contributorsRes, releasesRes] = await Promise.all([
            fetch(`https://api.github.com/repos/${repo}/readme`, { headers }),
            fetch(`https://api.github.com/repos/${repo}/commits?per_page=10`, { headers }),
            fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers }),
            fetch(`https://api.github.com/repos/${repo}/contributors?anon=1&per_page=1`, { headers }),
            fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers }),
        ]);

        let readmeText = '';
        if (readmeRes.ok) {
            const readmeJson: any = await readmeRes.json();
            readmeText = Buffer.from(readmeJson.content, 'base64').toString('utf-8');
        }

        const commitsData: any = commitsRes.ok ? await commitsRes.json() : [];
        const commitMessages = Array.isArray(commitsData)
            ? commitsData.map((commit: any) => commit.commit.message).join('\n')
            : '';

        let releaseData = null;
        if (releaseRes.ok) {
            const releaseJson: any = await releaseRes.json();
            releaseData = {
                version: releaseJson.tag_name,
                date: releaseJson.published_at,
                url: releaseJson.html_url,
            };
        }

        const contributors = contributorsRes.ok ? await contributorsRes.json() : null;
        const releases = releasesRes.ok ? await releasesRes.json() : null;

        return {
            repoInfo: repoData,
            readme: readmeText.substring(0, 3000),
            recentCommits: commitMessages,
            latestRelease: releaseData,
            licenseType: repoData.license?.spdx_id || repoData.license?.name || null,
            lastCommitAt: Array.isArray(commitsData)
                ? commitsData[0]?.commit?.author?.date || null
                : null,
            contributorsCount: getContributorCount(contributorsRes, contributors),
            openIssuesCount: typeof repoData.open_issues_count === 'number'
                ? repoData.open_issues_count
                : null,
            releaseCadenceDays: getReleaseCadenceDays(releases),
        };
    } catch (error) {
        console.error(`Error fetching GitHub data for ${repo}:`, error);
        return null;
    }
}
