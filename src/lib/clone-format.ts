/**
 * Shared presentation helpers for the clone tables and cards.
 *
 * The index and the radar list render the same row shape, so the column
 * template and the cell formatters live here rather than being duplicated
 * per component.
 */

type NamedClone = { data?: { name?: string }; name?: string };

/** One row of the index table. The radar table renders the same columns plus a link. */
export interface CloneRow {
    id: string;
    name: string;
    repoPath: string;
    language: string;
    stars: number;
    memoryMb: number | null;
    securityScore: number | null;
    license: string | null;
    /** Only surfaced when it is not `healthy`; the index never flags the normal case. */
    health: string | null;
    lastCommitAt: string | null;
}

/**
 * The radar list carries different facts from the index. A watchlist entry is
 * fetched without the AI pass, so it has no memory, boot time, security score
 * or licence — reusing the index columns rendered four dashes and a misleading
 * `0` for security. These are the fields that are actually populated.
 */
export interface WatchlistRow extends CloneRow {
    tag: 'radar' | 'candidate' | 'stale';
    href: string;
    linkLabel: string;
    external: boolean;
    /** Community sentiment, one of the three promotion thresholds. */
    pulse: number | null;
    /** Observed-since for radar entries, last commit for the ones that went quiet. */
    since: string | null;
    sinceLabel: string;
    /** What still stands between this entry and the main index. */
    waitingOn: string;
}

/**
 * Columns for the radar table.
 *   base — name, stars, action
 *   sm   — name, language, stars, pulse, action
 *   lg   — name, language, stars, pulse, waiting on, action
 *   xl   — name, language, stars, pulse, since, waiting on, action
 */
export const WATCHLIST_ROW_GRID =
    'grid-cols-[minmax(0,1fr)_64px_88px] sm:grid-cols-[minmax(0,1fr)_96px_72px_72px_104px] lg:grid-cols-[minmax(0,1fr)_100px_76px_76px_minmax(0,200px)_104px] xl:grid-cols-[minmax(0,1fr)_100px_76px_76px_152px_minmax(0,200px)_104px]';

/** Secondary facts under the name where the radar columns are hidden. */
export function formatWatchlistSubline(
    row: Pick<WatchlistRow, 'language' | 'pulse' | 'waitingOn'>,
): string {
    return [
        row.language,
        typeof row.pulse === 'number' ? `${row.pulse}% pulse` : null,
        row.waitingOn,
    ]
        .filter(Boolean)
        .join(' · ');
}

type RowSource = {
    id: string;
    data: {
        name: string;
        id: string;
        language: string;
        github_stars: number;
        metrics?: { memory_mb?: number | null; security_score?: number | null };
        license_type?: string | null;
        health_status?: string | null;
        last_commit_at?: string | null;
    };
};

/** Both collections share the clone schema, so one mapper feeds both tables. */
export function toCloneRow(clone: RowSource): CloneRow {
    return {
        id: clone.id,
        name: clone.data.name,
        repoPath: clone.data.id,
        language: clone.data.language,
        stars: clone.data.github_stars,
        memoryMb: clone.data.metrics?.memory_mb ?? null,
        securityScore: clone.data.metrics?.security_score ?? null,
        license: formatLicense(clone.data.license_type),
        health: clone.data.health_status && clone.data.health_status !== 'healthy'
            ? clone.data.health_status
            : null,
        lastCommitAt: clone.data.last_commit_at || null,
    };
}

/**
 * GitHub reports an undetected license as `NOASSERTION`, which means nothing to
 * a reader — it is shown as unknown rather than as a licence name.
 */
function formatLicense(license: string | null | undefined): string | null {
    if (!license || license === 'NOASSERTION') return null;
    return license;
}

/**
 * Column template shared by the index table and the radar table, so the two
 * lists stay aligned when a breakpoint changes.
 *
 * Cells are placed automatically, so a hidden cell yields its column: the
 * template per breakpoint must list exactly the columns visible there.
 *   base — name, stars, action
 *   sm   — name, language, stars, memory, action
 *   lg   — name, language, stars, memory, security, last commit, action
 *   xl   — name, language, stars, memory, security, license, last commit, action
 * The columns hidden at a breakpoint are folded into a sub-line under the name.
 */
export const CLONE_ROW_GRID =
    'grid-cols-[minmax(0,1fr)_64px_88px] sm:grid-cols-[minmax(0,1fr)_96px_72px_80px_104px] lg:grid-cols-[minmax(0,1fr)_100px_76px_76px_72px_112px_104px] xl:grid-cols-[minmax(0,1fr)_100px_76px_76px_72px_96px_112px_104px]';

/** Secondary facts shown under the name where the columns are hidden. */
export function formatRowSubline(
    row: Pick<CloneRow, 'language' | 'memoryMb' | 'securityScore'>,
): string {
    return [
        row.language,
        row.memoryMb ? `${row.memoryMb} MB` : null,
        typeof row.securityScore === 'number' ? `sec ${row.securityScore}` : null,
    ]
        .filter(Boolean)
        .join(' · ');
}

/** Security scores are only worth colouring when they are low enough to matter. */
export function securityTone(score: number | null): string {
    if (score === null) return 'text-pale-slate-400';
    if (score < 55) return 'text-amber-600 dark:text-amber-400';
    return 'text-pale-slate-700 dark:text-pale-slate-300';
}

export function formatStars(stars: number): string {
    return stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10_000 ? 0 : 1)}k` : String(stars);
}

/** Repo timestamps are free-form strings in the schema, so unparseable values fall back to a dash. */
export function formatCommitDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

/** `openclaw/openclaw` reads as `openclaw` everywhere we show a clone name. */
export function getDisplayName(clone: NamedClone | string): string {
    const name = typeof clone === 'string' ? clone : clone.data?.name ?? clone.name ?? '';
    return name.split('/').pop() || name;
}
