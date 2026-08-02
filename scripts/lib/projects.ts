/**
 * The single source of truth for which repositories the site follows.
 *
 * This replaces `tracked-clones.json` and `watchlist-clones.json`. Membership
 * used to be recorded in four places — those two lists, a `promotion_status`
 * field inside the generated watchlist content, and an activity check at render
 * time — and they had already drifted: a duplicate entry, two promotion
 * leftovers, and three test fixtures visible on the live radar list.
 *
 * Here a project has exactly one status, and promotion is a single word.
 * "Stale" is deliberately absent: that is derived from `last_commit_at` when
 * the page renders, so it is never stored.
 */
import * as fs from 'fs';
import * as path from 'path';

export const PROJECTS_PATH = path.join(process.cwd(), 'projects.json');

export const PROJECT_STATUSES = ['tracked', 'watching', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
    /** GitHub `owner/repo`. */
    repo: string;
    /**
     * `tracked`  — full profile, appears in the index
     * `watching` — lightweight entry, appears on the radar
     * `archived` — deliberately dropped; kept so discovery cannot re-add it
     */
    status: ProjectStatus;
    /** When it entered the list, for the watchlist age threshold. */
    since?: string;
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Validates the whole file and reports every problem at once. A silent
 * duplicate is how `spacedriveapp/spacebot` ended up listed twice.
 */
export function validateProjects(value: unknown): Project[] {
    const problems: string[] = [];

    if (!Array.isArray(value)) {
        throw new Error(`${PROJECTS_PATH}: expected an array of projects.`);
    }

    const seen = new Map<string, number>();
    const projects: Project[] = [];

    value.forEach((entry, index) => {
        const where = `entry ${index}`;
        if (typeof entry !== 'object' || entry === null) {
            problems.push(`${where}: expected an object.`);
            return;
        }

        const { repo, status, since } = entry as Record<string, unknown>;

        if (typeof repo !== 'string' || !REPO_PATTERN.test(repo)) {
            problems.push(`${where}: "repo" must look like owner/repo, got ${JSON.stringify(repo)}.`);
            return;
        }
        if (typeof status !== 'string' || !PROJECT_STATUSES.includes(status as ProjectStatus)) {
            problems.push(
                `${repo}: "status" must be one of ${PROJECT_STATUSES.join(', ')}, got ${JSON.stringify(status)}.`,
            );
            return;
        }
        if (since !== undefined && (typeof since !== 'string' || Number.isNaN(Date.parse(since)))) {
            problems.push(`${repo}: "since" must be a date string, got ${JSON.stringify(since)}.`);
            return;
        }

        const key = repo.toLowerCase();
        const first = seen.get(key);
        if (first !== undefined) {
            problems.push(`${repo}: listed twice (entries ${first} and ${index}).`);
            return;
        }
        seen.set(key, index);

        projects.push({ repo, status: status as ProjectStatus, ...(since ? { since } : {}) });
    });

    if (problems.length > 0) {
        throw new Error(`${PROJECTS_PATH} is invalid:\n  - ${problems.join('\n  - ')}`);
    }

    return projects;
}

export function loadProjects(): Project[] {
    let raw: string;
    try {
        raw = fs.readFileSync(PROJECTS_PATH, 'utf-8');
    } catch {
        throw new Error(`${PROJECTS_PATH} is missing; it is the list of repositories to follow.`);
    }
    return validateProjects(JSON.parse(raw));
}

/** Written back sorted by status then repo, so diffs stay readable. */
export function saveProjects(projects: Project[]): void {
    const order = new Map(PROJECT_STATUSES.map((status, index) => [status, index]));
    const sorted = [...projects].sort(
        (left, right) =>
            (order.get(left.status) ?? 0) - (order.get(right.status) ?? 0) ||
            left.repo.localeCompare(right.repo),
    );
    fs.writeFileSync(PROJECTS_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
}

export function reposWithStatus(projects: Project[], status: ProjectStatus): string[] {
    return projects.filter((project) => project.status === status).map((project) => project.repo);
}

/**
 * Promotion, demotion and archiving are all this one call — no copying between
 * files, so there is no half-finished state to leave behind.
 */
export function setStatus(
    projects: Project[],
    repo: string,
    status: ProjectStatus,
): Project[] {
    const key = repo.toLowerCase();
    const next = projects.map((project) =>
        project.repo.toLowerCase() === key ? { ...project, status } : project,
    );
    if (!next.some((project) => project.repo.toLowerCase() === key)) {
        next.push({ repo, status, since: new Date().toISOString() });
    }
    return next;
}
