import { detectModelSupport, publishModelSupport } from './model-support';
import type { PublishedModelSupport } from './model-support';
import { fetchModelCatalogue, resolveModelDate } from './model-catalogue';
import type { ModelCatalogue } from './model-catalogue';
import { GitHubRepoSource } from './repo-source';

/**
 * The catalogue is the same for every repo in a run, so it is fetched once and
 * held for the process. A pipeline run is a single process; nothing here is
 * meant to outlive it.
 */
let cataloguePromise: Promise<ModelCatalogue> | null = null;

function getCatalogue(): Promise<ModelCatalogue> {
    if (!cataloguePromise) cataloguePromise = fetchModelCatalogue();
    return cataloguePromise;
}

/**
 * Runs the provider detector against a repo on GitHub.
 *
 * Returns `undefined` rather than `null` when detection fails, because the two
 * mean different things downstream: `undefined` leaves whatever was detected on
 * a previous run in place, while `null` would erase it. A rate limit should not
 * blank a profile.
 */
export async function fetchModelSupport(repo: string): Promise<PublishedModelSupport | undefined> {
    try {
        const source = new GitHubRepoSource(repo);
        const support = await detectModelSupport(source);

        if (source.truncated) {
            console.warn(`  ! ${repo}: file tree was truncated, provider coverage may be partial`);
        }

        if (!support.default_model) return publishModelSupport(support);

        const [lastTouched, catalogue] = await Promise.all([
            source.lastCommitDate(support.default_model.path),
            getCatalogue(),
        ]);

        return publishModelSupport(support, {
            lastTouched,
            released: resolveModelDate(support.default_model.model, catalogue),
        });
    } catch (error) {
        console.warn(`  ! ${repo}: model support detection failed - ${(error as Error).message}`);
        return undefined;
    }
}
