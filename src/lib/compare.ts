type CompareCloneLike = {
    id: string;
    data?: {
        name?: string;
    };
};

export function getCompareSlug(clone: CompareCloneLike | string): string {
    if (typeof clone === "string") {
        return clone.toLowerCase();
    }

    return clone.id.toLowerCase();
}

export function getLegacyCompareSlug(clone: CompareCloneLike): string {
    const legacySlug = clone.data?.name?.split("/").pop()?.trim().toLowerCase();
    return legacySlug || getCompareSlug(clone);
}

export function getCanonicalCompareSlugs(
    left: CompareCloneLike | string,
    right: CompareCloneLike | string,
): [string, string] {
    return [getCompareSlug(left), getCompareSlug(right)].sort((a, b) =>
        a.localeCompare(b),
    ) as [string, string];
}

export function getCanonicalComparePath(
    left: CompareCloneLike | string,
    right: CompareCloneLike | string,
): string {
    const [first, second] = getCanonicalCompareSlugs(left, right);
    return `/compare/${first}-vs-${second}`;
}

export function matchesCompareSlug(
    clone: CompareCloneLike,
    rawSlug: string,
): boolean {
    const normalizedSlug = decodeURIComponent(rawSlug).toLowerCase();
    return (
        getCompareSlug(clone) === normalizedSlug ||
        getLegacyCompareSlug(clone) === normalizedSlug
    );
}
