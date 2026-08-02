const ACTIVITY_WINDOW_DAYS = 182; // ~6 months

type ActivityLike = {
    data: {
        last_commit_at?: string | null;
    };
};

/**
 * A clone counts as "active" only if it has a commit within the last ~6
 * months. Missing commit data is treated as inactive rather than assumed
 * fresh, since we can't confirm recent activity either way.
 */
export function isCloneActive(clone: ActivityLike, now: Date = new Date()): boolean {
    const lastCommitAt = clone.data.last_commit_at;
    if (!lastCommitAt) return false;

    const commitDate = new Date(lastCommitAt);
    if (Number.isNaN(commitDate.getTime())) return false;

    const ageInDays = (now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24);
    return ageInDays <= ACTIVITY_WINDOW_DAYS;
}
