/**
 * Outward-facing identifiers for the project itself.
 *
 * Kept in one place because these strings appear in the nomination modal, the
 * about page and the issue links: when the public repository is created under
 * a different name, this is the only line that has to change.
 */
export const SITE_REPO = 'naturalmoods/clawclones';
export const SITE_REPO_URL = `https://github.com/${SITE_REPO}`;
export const MAINTAINER_GITHUB_URL = 'https://github.com/naturalmoods';
export const CONTACT_EMAIL = 'hello@clawclones.com';

/** Prefilled link to a GitHub issue form, using the form's own field ids. */
export function issueFormUrl(
    template: string,
    fields: Record<string, string> = {},
): string {
    const params = new URLSearchParams({ template });
    for (const [key, value] of Object.entries(fields)) {
        if (value) params.set(key, value);
    }
    return `${SITE_REPO_URL}/issues/new?${params.toString()}`;
}
