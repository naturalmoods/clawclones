import 'dotenv/config';
import * as path from 'path';

import { OUTPUT_DIR } from './lib/config';
import { loadProjects, reposWithStatus } from './lib/projects';
import { loadJSON, saveJSON } from './lib/storage';
import { getSafeFileName } from './lib/utils';
import { fetchModelSupport } from './lib/model-support-github';
import type { PublishedModelSupport } from './lib/model-support';

/**
 * Refreshes only the provider/model fields of tracked clones.
 *
 * Split out from `update-data` on purpose: this pass makes no AI calls and no
 * Reddit or Brave calls, so it is cheap enough to run on its own schedule. That
 * matters because a default model changes far more often than a project's
 * summary does.
 */

interface Options {
    repos: string[];
    dryRun: boolean;
    verbose: boolean;
}

function parseOptions(argv: string[]): Options {
    const inline = argv.find(arg => arg.startsWith('--repos='))?.split('=')[1];
    const flagIndex = argv.indexOf('--repos');
    const flagValue = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
    const raw = process.env.TARGET_REPOS || inline || flagValue || '';

    return {
        repos: [...new Set(raw.split(/[\s,]+/).map(value => value.trim()).filter(Boolean))],
        dryRun: argv.includes('--dry-run'),
        verbose: argv.includes('--verbose'),
    };
}

function summarize(repo: string, support: PublishedModelSupport, verbose: boolean): string {
    const flags = [
        support.local_capable ? 'local' : null,
        support.aggregator_capable ? 'gateway' : null,
        support.byo_endpoint ? 'byo' : null,
        support.provider_lock ? `locked:${support.provider_lock}` : null,
    ].filter(Boolean);

    const model = support.default_model
        ? `${support.default_model.model}${support.default_model_ambiguous ? ' (+others)' : ''}`
        : 'no pinned default';

    const head = `${repo}: ${support.provider_count} vendor(s), ${model}${flags.length ? ` [${flags.join(' ')}]` : ''}`;
    if (!verbose) return head;

    const detail = support.providers.map(provider => `      ${provider}`).join('\n');
    return `${head}\n${detail}`;
}

async function main(): Promise<void> {
    const options = parseOptions(process.argv.slice(2));
    const tracked = reposWithStatus(loadProjects(), 'tracked');
    const targets = options.repos.length ? tracked.filter(repo => options.repos.includes(repo)) : tracked;

    const unknown = options.repos.filter(repo => !tracked.includes(repo));
    if (unknown.length > 0) console.warn(`Skipping repos that are not tracked: ${unknown.join(', ')}`);

    if (targets.length === 0) {
        console.log('No tracked repos selected.');
        return;
    }

    let written = 0;
    let skipped = 0;

    for (const repo of targets) {
        const support = await fetchModelSupport(repo);
        if (!support) {
            skipped += 1;
            continue;
        }

        console.log(summarize(repo, support, options.verbose));

        if (options.dryRun) continue;

        const filePath = path.join(OUTPUT_DIR, `${getSafeFileName(repo)}.json`);
        const existing = loadJSON(filePath);
        if (!existing) {
            console.warn(`  ! ${repo}: no profile at ${filePath}, run update-data first`);
            skipped += 1;
            continue;
        }

        saveJSON(filePath, { ...existing, model_support: support });
        written += 1;
    }

    console.log(`Model support refresh complete: ${written} written, ${skipped} skipped.`);
    if (written === 0 && !options.dryRun) process.exitCode = 1;
}

main().catch(error => {
    console.error('update-model-support failed:', error);
    process.exitCode = 1;
});
