import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { RepoFileSource } from './model-support';
import { isValidToken } from './utils';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_AUTH_TOKEN = isValidToken(GITHUB_TOKEN) ? GITHUB_TOKEN : undefined;

const API_HEADERS: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ClawClones-Aggregator',
};

if (GITHUB_AUTH_TOKEN) {
    API_HEADERS.Authorization = `token ${GITHUB_AUTH_TOKEN}`;
}

/**
 * Reads a repo through the GitHub API: one tree call for the file list, then raw
 * fetches for the handful of files the detector asks for. Raw fetches do not
 * spend the API rate limit, which is what keeps a full ecosystem pass cheap.
 */
export class GitHubRepoSource implements RepoFileSource {
    private files: string[] | null = null;
    private branch: string | null = null;
    /** True when the repo has more files than one tree response can carry. */
    truncated = false;

    constructor(private readonly repo: string, branch?: string) {
        this.branch = branch ?? null;
    }

    private async resolveBranch(): Promise<string> {
        if (this.branch) return this.branch;

        const response = await fetch(`https://api.github.com/repos/${this.repo}`, { headers: API_HEADERS });
        if (!response.ok) throw new Error(`repo lookup failed: ${response.status}`);

        const data: any = await response.json();
        this.branch = data.default_branch || 'main';
        return this.branch as string;
    }

    async listFiles(): Promise<string[]> {
        if (this.files) return this.files;

        const branch = await this.resolveBranch();
        const response = await fetch(
            `https://api.github.com/repos/${this.repo}/git/trees/${branch}?recursive=1`,
            { headers: API_HEADERS },
        );
        if (!response.ok) throw new Error(`tree fetch failed: ${response.status}`);

        const data: any = await response.json();
        this.truncated = Boolean(data.truncated);
        const files: string[] = Array.isArray(data.tree)
            ? data.tree.filter((entry: any) => entry.type === 'blob').map((entry: any) => entry.path as string)
            : [];

        this.files = files;
        return files;
    }

    async readFile(path: string): Promise<string | null> {
        const branch = await this.resolveBranch();
        const url = `https://raw.githubusercontent.com/${this.repo}/${branch}/${path}`;
        const response = await fetch(url, { headers: { 'User-Agent': API_HEADERS['User-Agent'] } });
        if (!response.ok) return null;

        return response.text();
    }

    /**
     * When the file was last committed. Used to date a pinned model: the id
     * itself rarely says when it was chosen, but the file it sits in does.
     *
     * This is file granularity, not line granularity — an unrelated edit to the
     * same file resets it. That makes it a floor on staleness, never an
     * overstatement, which is the safe direction for a claim on a public page.
     */
    async lastCommitDate(path: string): Promise<string | null> {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${this.repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
                { headers: API_HEADERS },
            );
            if (!response.ok) return null;

            const data: any = await response.json();
            const date = Array.isArray(data) ? data[0]?.commit?.committer?.date : null;
            return typeof date === 'string' ? date : null;
        } catch {
            return null;
        }
    }
}

const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'vendor', 'target', 'dist', 'build', '.venv', '__pycache__']);

/** Reads a repo from a local checkout. Used by the smoke script and offline runs. */
export class LocalRepoSource implements RepoFileSource {
    private files: string[] | null = null;

    constructor(private readonly root: string) {}

    async listFiles(): Promise<string[]> {
        if (this.files) return this.files;

        const collected: string[] = [];

        const walk = async (directory: string): Promise<void> => {
            const entries = await readdir(directory, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isSymbolicLink()) continue;
                const full = join(directory, entry.name);
                if (entry.isDirectory()) {
                    if (SKIP_DIRECTORIES.has(entry.name)) continue;
                    await walk(full);
                    continue;
                }
                if (entry.isFile()) {
                    collected.push(relative(this.root, full).split(sep).join('/'));
                }
            }
        };

        await walk(this.root);
        this.files = collected;
        return collected;
    }

    async readFile(path: string): Promise<string | null> {
        const full = join(this.root, path);
        try {
            const info = await stat(full);
            if (!info.isFile()) return null;
            return await readFile(full, 'utf-8');
        } catch {
            return null;
        }
    }
}
