/**
 * Which comparison pages are worth putting in front of a search engine.
 *
 * There are 861 pairwise compare pages and they are all generated from the
 * same dashboard, so indexing every one of them invites a thin-content
 * problem. The previous rule indexed only the 41 pairs containing OpenClaw —
 * but those account for 9% of the measured traffic, while the six most visited
 * comparisons contain no OpenClaw at all.
 *
 * Star count alone is a weak predictor: `andyclaw-vs-hermes-agent` is the
 * fourth most visited comparison on the site with 89 stars on its weaker side,
 * which no sensible star threshold would ever admit. So recorded demand leads,
 * and stars only cover pairs that have no traffic history yet.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface IndexingClone {
    /** Canonical compare slug — the content collection id, lowercased. */
    slug: string;
    /** Name-derived slug, still present in older recorded analytics paths. */
    legacySlug: string;
    stars: number;
    isOpenClaw: boolean;
}

export const COMPARE_INDEX_THRESHOLDS = {
    /**
     * Under three visits a page is indistinguishable from crawler noise: 665
     * of the 861 pairs sat at zero to two visits across the recorded window.
     */
    minVisits: 3,
    /** Cold start, so a new pair of well-known projects is not invisible until it earns traffic. */
    minStars: 5_000,
};

export type AnalyticsFile = Record<
    string,
    Record<string, { type?: string; visits?: number }>
>;

export const INDEXABLE_COMPARES_PATH = path.join(
    process.cwd(),
    'src',
    'data',
    'indexable-compares.json',
);

/**
 * Reads the committed decision. Lives here rather than in the page frontmatter
 * because Astro evaluates `getStaticPaths` in its own scope, where only
 * imported bindings are reachable.
 *
 * A missing file yields an empty set, and the caller falls back to the
 * OpenClaw pairs — never to indexing all 861.
 */
export function loadIndexableCompares(): Set<string> {
    try {
        const raw = fs.readFileSync(INDEXABLE_COMPARES_PATH, 'utf8');
        return new Set<string>(JSON.parse(raw).slugs ?? []);
    } catch {
        console.warn(
            'compare-indexing: indexable-compares.json missing, indexing OpenClaw pairs only',
        );
        return new Set<string>();
    }
}

export function canonicalPairSlug(left: string, right: string): string {
    return [left, right].sort((a, b) => a.localeCompare(b)).join('-vs-');
}

/**
 * Folds every recorded compare path onto its canonical pair slug. Recorded
 * paths are not normalised: they carry percent-encoding and name-derived
 * slugs, so both spellings resolve through the same lookup.
 */
export function aggregateCompareVisits(
    analytics: AnalyticsFile,
    clones: IndexingClone[],
): Map<string, number> {
    const bySlug = new Map<string, string>();
    for (const clone of clones) {
        bySlug.set(clone.slug, clone.slug);
        bySlug.set(clone.legacySlug, clone.slug);
    }

    const visits = new Map<string, number>();
    for (const day of Object.values(analytics)) {
        for (const [key, entry] of Object.entries(day)) {
            if (entry?.type !== 'vs') continue;
            const count = entry.visits ?? 0;
            if (count <= 0) continue;

            const parts = key.split('-vs-');
            if (parts.length !== 2) continue;

            const resolved = parts.map((part) => {
                let decoded = part;
                try {
                    decoded = decodeURIComponent(part);
                } catch {
                    // Malformed escapes are left as-is; the lookup just misses.
                }
                return bySlug.get(decoded.trim().toLowerCase());
            });
            if (!resolved[0] || !resolved[1] || resolved[0] === resolved[1]) continue;

            const pair = canonicalPairSlug(resolved[0], resolved[1]);
            visits.set(pair, (visits.get(pair) ?? 0) + count);
        }
    }

    return visits;
}

export interface IndexableComparesResult {
    slugs: string[];
    /** Counts behind the decision, logged by the generator so a shift is visible in CI output. */
    stats: {
        totalPairs: number;
        openClaw: number;
        byVisits: number;
        byStars: number;
        carriedOver: number;
        dropped: number;
    };
}

/**
 * The result is sticky: a page that once qualified stays qualified, because a
 * URL that flips between indexable and noindex on every refresh is worse for
 * ranking than either state. Stickiness is still bounded by what the build
 * actually produces — pairs whose projects left the collection are dropped.
 */
export function buildIndexableCompares(options: {
    clones: IndexingClone[];
    analytics: AnalyticsFile;
    previous?: string[];
}): IndexableComparesResult {
    const { clones, analytics, previous = [] } = options;
    const visits = aggregateCompareVisits(analytics, clones);

    const existing = new Map<string, { openClaw: boolean; minStars: number }>();
    for (let i = 0; i < clones.length; i += 1) {
        for (let j = i + 1; j < clones.length; j += 1) {
            const left = clones[i]!;
            const right = clones[j]!;
            existing.set(canonicalPairSlug(left.slug, right.slug), {
                openClaw: left.isOpenClaw || right.isOpenClaw,
                minStars: Math.min(left.stars, right.stars),
            });
        }
    }

    const selected = new Set<string>();
    const stats = {
        totalPairs: existing.size,
        openClaw: 0,
        byVisits: 0,
        byStars: 0,
        carriedOver: 0,
        dropped: 0,
    };

    for (const [pair, facts] of existing) {
        if (facts.openClaw) {
            selected.add(pair);
            stats.openClaw += 1;
            continue;
        }
        if ((visits.get(pair) ?? 0) >= COMPARE_INDEX_THRESHOLDS.minVisits) {
            selected.add(pair);
            stats.byVisits += 1;
            continue;
        }
        if (facts.minStars >= COMPARE_INDEX_THRESHOLDS.minStars) {
            selected.add(pair);
            stats.byStars += 1;
        }
    }

    for (const pair of previous) {
        if (!existing.has(pair)) {
            stats.dropped += 1;
            continue;
        }
        if (!selected.has(pair)) {
            selected.add(pair);
            stats.carriedOver += 1;
        }
    }

    return { slugs: [...selected].sort(), stats };
}
