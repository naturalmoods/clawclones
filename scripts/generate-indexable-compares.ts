/**
 * Writes the list of comparison pages that may be indexed.
 *
 * Two consumers read the result — the `robots` meta on the compare page and
 * the sitemap filter in `astro.config.mjs`. Both used to carry their own copy
 * of the rule, which is exactly the kind of duplication that drifts.
 *
 * Runs before `astro build`; the output is committed so a fresh clone builds
 * with the same index set and so the list can stay sticky across runs.
 */
import * as fs from 'fs';
import * as path from 'path';
import { OUTPUT_DIR, DATA_DIR } from './lib/config';
import {
    buildIndexableCompares,
    COMPARE_INDEX_THRESHOLDS,
    type AnalyticsFile,
    type IndexingClone,
} from '../src/lib/compare-indexing';

const OUTPUT_PATH = path.join(DATA_DIR, 'indexable-compares.json');
const ANALYTICS_PATH = path.join(DATA_DIR, 'analytics.json');

function readJSON<T>(filePath: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch {
        return fallback;
    }
}

function loadClones(): IndexingClone[] {
    return fs
        .readdirSync(OUTPUT_DIR)
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
            const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf-8'));
            // Astro's glob loader lowercases the filename into the collection id,
            // and `getCompareSlug` is that id — so the slug is derived the same way here.
            const slug = file.replace(/\.json$/, '').toLowerCase();
            const legacySlug = String(data.name ?? slug)
                .split('/')
                .pop()!
                .trim()
                .toLowerCase();
            return {
                slug,
                legacySlug,
                stars: Number(data.github_stars) || 0,
                isOpenClaw: slug === 'openclaw',
            };
        });
}

function main() {
    const clones = loadClones();
    const analytics = readJSON<AnalyticsFile>(ANALYTICS_PATH, {});
    const previous = readJSON<{ slugs?: string[] }>(OUTPUT_PATH, {}).slugs ?? [];

    const { slugs, stats } = buildIndexableCompares({ clones, analytics, previous });

    fs.writeFileSync(
        OUTPUT_PATH,
        `${JSON.stringify(
            {
                generated_from: {
                    tracked_clones: clones.length,
                    min_visits: COMPARE_INDEX_THRESHOLDS.minVisits,
                    min_stars: COMPARE_INDEX_THRESHOLDS.minStars,
                },
                slugs,
            },
            null,
            2,
        )}\n`,
        'utf-8',
    );

    const share = stats.totalPairs > 0 ? Math.round((slugs.length / stats.totalPairs) * 100) : 0;
    console.log(
        `Indexable compares: ${slugs.length} of ${stats.totalPairs} pairs (${share}%) — ` +
            `${stats.openClaw} via OpenClaw, ${stats.byVisits} via traffic, ${stats.byStars} via stars, ` +
            `${stats.carriedOver} carried over, ${stats.dropped} dropped as untracked.`,
    );
}

main();
