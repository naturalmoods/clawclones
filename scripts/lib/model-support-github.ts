import { detectModelSupport, publishModelSupport } from './model-support';
import type { PublishedModelSupport } from './model-support';
import { GitHubRepoSource } from './repo-source';

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

        const lastTouched = support.default_model
            ? await source.lastCommitDate(support.default_model.path)
            : null;

        return publishModelSupport(support, lastTouched);
    } catch (error) {
        console.warn(`  ! ${repo}: model support detection failed - ${(error as Error).message}`);
        return undefined;
    }
}
