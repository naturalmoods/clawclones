import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CLONE_ROW_GRID,
    formatCommitDate,
    formatRowSubline,
    formatStars,
    securityTone,
    type CloneRow,
} from '../lib/clone-format';

type SortKey = 'fit' | 'stars' | 'name' | 'memory' | 'security' | 'activity';

export interface IntentCategory {
    id: string;
    label: string;
    hint: string;
}

interface Props {
    clones: CloneRow[];
    /** Chips shown above the table. The first entry is the unfiltered state. */
    intentCategories: IntentCategory[];
    /** Clone ids per intent, already ranked by fit at build time. */
    intentShortlists: Record<string, string[]>;
}

const MAX_SELECTED = 2;
const ALL_INTENT = 'all';

const SORT_LABELS: Record<SortKey, string> = {
    fit: 'Fit',
    name: 'Name',
    stars: 'Stars',
    memory: 'Memory',
    security: 'Security',
    activity: 'Last commit',
};

// The natural reading of each column: biggest first for counts, smallest first
// for a footprint, newest first for activity, A–Z for names.
const SORTS_DESC_FIRST: Record<SortKey, boolean> = {
    fit: true,
    name: false,
    stars: true,
    memory: false,
    security: true,
    activity: true,
};

function compareBy(key: SortKey, left: CloneRow, right: CloneRow, rankById: Map<string, number>): number {
    if (key === 'name') return left.name.localeCompare(right.name);
    if (key === 'memory') return (left.memoryMb ?? 0) - (right.memoryMb ?? 0);
    if (key === 'security') return (left.securityScore ?? 0) - (right.securityScore ?? 0);
    if (key === 'activity') {
        return new Date(left.lastCommitAt || 0).getTime() - new Date(right.lastCommitAt || 0).getTime();
    }
    if (key === 'fit') {
        // Rank 0 is the best fit, so the order is inverted against the descending default.
        return (rankById.get(right.id) ?? Number.MAX_SAFE_INTEGER) - (rankById.get(left.id) ?? Number.MAX_SAFE_INTEGER);
    }
    return left.stars - right.stars;
}

export default function ComparisonTable({ clones, intentCategories, intentShortlists }: Props) {
    const [query, setQuery] = useState('');
    const [intent, setIntent] = useState(ALL_INTENT);
    // Null means "whatever is natural for the current intent", so switching
    // intents re-sorts by fit without stranding a stale column choice.
    const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    // Bumped on every over-limit attempt so a repeated click re-arms the hint.
    const [overflowHint, setOverflowHint] = useState(0);

    useEffect(() => {
        if (overflowHint === 0) return;
        const timer = setTimeout(() => setOverflowHint(0), 1800);
        return () => clearTimeout(timer);
    }, [overflowHint]);

    // `?intent=` is a real entry point: use-case pages and shared links land here,
    // and the back button has to walk through the filters the visitor picked.
    useEffect(() => {
        const syncFromUrl = () => {
            const next = new URLSearchParams(window.location.search).get('intent') || ALL_INTENT;
            setIntent(intentShortlists[next] ? next : ALL_INTENT);
            setSort(null);
        };

        syncFromUrl();
        window.addEventListener('popstate', syncFromUrl);
        return () => window.removeEventListener('popstate', syncFromUrl);
    }, [intentShortlists]);

    const selectIntent = useCallback((next: string) => {
        setIntent(next);
        setSort(null);

        const url = new URL(window.location.href);
        if (next === ALL_INTENT) url.searchParams.delete('intent');
        else url.searchParams.set('intent', next);
        window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }, []);

    const shortlist = intent === ALL_INTENT ? null : intentShortlists[intent] ?? null;
    const activeCategory = intentCategories.find((category) => category.id === intent);

    const rankById = useMemo(() => {
        const map = new Map<string, number>();
        shortlist?.forEach((id, index) => map.set(id, index));
        return map;
    }, [shortlist]);

    const effectiveSort = sort ?? (shortlist ? { key: 'fit' as SortKey, desc: true } : { key: 'stars' as SortKey, desc: true });

    const rows = useMemo(() => {
        const pool = shortlist ? clones.filter((clone) => rankById.has(clone.id)) : clones;
        return pool
            // Providers are searchable but not shown as a column: typing "ollama"
            // should narrow the table without spending width on a list of badges.
            .filter((clone) =>
                `${clone.name} ${clone.language} ${clone.providers.join(' ')}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            )
            .sort((left, right) => (effectiveSort.desc ? -1 : 1) * compareBy(effectiveSort.key, left, right, rankById));
    }, [clones, query, effectiveSort.key, effectiveSort.desc, shortlist, rankById]);

    // Re-selecting the active column flips it; a new column starts in its natural direction.
    const applySort = (key: SortKey) => {
        setSort((prev) => {
            const current = prev ?? effectiveSort;
            return current.key === key ? { key, desc: !current.desc } : { key, desc: SORTS_DESC_FIRST[key] };
        });
    };

    const toggleSelect = (id: string) => {
        if (selected.includes(id)) {
            setSelected((prev) => prev.filter((entryId) => entryId !== id));
            return;
        }
        if (selected.length >= MAX_SELECTED) {
            setOverflowHint((attempt) => attempt + 1);
            return;
        }
        setSelected((prev) => [...prev, id]);
    };

    const selectedClones = selected
        .map((id) => clones.find((clone) => clone.id === id))
        .filter((clone): clone is CloneRow => Boolean(clone));
    const compareHref = selected.length === MAX_SELECTED ? `/compare/${[...selected].sort().join('-vs-')}` : null;

    const sortKeys: SortKey[] = shortlist
        ? ['fit', 'name', 'stars', 'memory', 'security', 'activity']
        : ['name', 'stars', 'memory', 'security', 'activity'];

    const SortHeader = ({ column, align = 'left', className = '' }: { column: SortKey; align?: 'left' | 'right'; className?: string }) => {
        const isActive = effectiveSort.key === column;
        return (
            <button
                type="button"
                onClick={() => applySort(column)}
                aria-label={`Sort by ${SORT_LABELS[column].toLowerCase()}`}
                aria-pressed={isActive}
                className={`w-full font-mono text-[10px] uppercase tracking-[0.18em] cursor-pointer transition-colors duration-150 ${
                    align === 'right' ? 'text-right' : 'text-left'
                } ${isActive ? 'text-accent dark:text-accent-soft' : 'text-pale-slate-400 hover:text-ink dark:hover:text-white'} ${className}`}
            >
                {SORT_LABELS[column]}
                <span aria-hidden="true" className={isActive ? 'ml-1' : 'ml-1 opacity-0'}>
                    {effectiveSort.desc ? '↓' : '↑'}
                </span>
            </button>
        );
    };

    return (
        <div>
            <div className="sticky top-14 z-30 border-t hairline bg-paper">
                <div className="flex items-center gap-2 px-6 py-2.5 border-b hairline overflow-x-auto">
                    {intentCategories.map((category) => {
                        const isActive = category.id === intent;
                        return (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => selectIntent(category.id)}
                                aria-pressed={isActive}
                                title={category.hint}
                                className={`shrink-0 font-mono text-[11px] border rounded-sm px-2.5 py-1 cursor-pointer transition-colors duration-150 whitespace-nowrap ${
                                    isActive
                                        ? 'text-accent dark:text-accent-soft border-accent/45 dark:border-accent-soft/45 bg-accent/5 dark:bg-accent-soft/[0.06]'
                                        : 'hairline text-pale-slate-500 dark:text-pale-slate-400 hover:text-ink dark:hover:text-white'
                                }`}
                            >
                                {category.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b hairline">
                    <label className="sr-only" htmlFor="clone-table-search">Search alternatives</label>
                    <input
                        id="clone-table-search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Name, language or provider"
                        className="flex-1 min-w-0 sm:flex-none sm:w-52 font-mono text-[12px] bg-transparent border hairline rounded-sm px-2.5 py-1.5 text-pale-slate-600 dark:text-pale-slate-400 placeholder-pale-slate-400 focus:outline-none focus:border-accent dark:focus:border-accent-soft"
                    />
                    {/* Memory and last commit have no visible header below `sm`, so touch layouts sort from here. */}
                    <label className="sr-only" htmlFor="clone-table-sort">Sort alternatives</label>
                    <select
                        id="clone-table-sort"
                        value={effectiveSort.key}
                        onChange={(event) => applySort(event.target.value as SortKey)}
                        className="sm:hidden shrink-0 font-mono text-[12px] bg-transparent border hairline rounded-sm px-2.5 py-1.5 text-pale-slate-600 dark:text-pale-slate-400 focus:outline-none focus:border-accent cursor-pointer"
                    >
                        {sortKeys.map((key) => (
                            <option key={key} value={key}>Sort: {SORT_LABELS[key]}</option>
                        ))}
                    </select>
                    <span className="ml-auto font-mono text-[11px] text-pale-slate-400" role="status" aria-live="polite">
                        {rows.length} of {clones.length} shown
                    </span>
                </div>

                {activeCategory && intent !== ALL_INTENT && (
                    <p className="px-6 py-2 border-b hairline font-mono text-[11px] text-pale-slate-500">
                        Ranked by fit for <span className="text-accent dark:text-accent-soft">{activeCategory.label}</span> — {activeCategory.hint.toLowerCase()}.
                    </p>
                )}

                <div className={`grid ${CLONE_ROW_GRID} gap-x-4 px-6 py-2.5 border-b hairline select-none`}>
                    <SortHeader column="name" />
                    <div className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.18em] text-pale-slate-400">Language</div>
                    <SortHeader column="stars" align="right" />
                    <SortHeader column="memory" align="right" className="hidden sm:block" />
                    <SortHeader column="security" align="right" className="hidden lg:block" />
                    <div className="hidden xl:block font-mono text-[10px] uppercase tracking-[0.18em] text-pale-slate-400 text-right">License</div>
                    <SortHeader column="activity" align="right" className="hidden lg:block" />
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-pale-slate-400 text-right">Compare</div>
                </div>
            </div>

            {rows.map((clone) => {
                const isSelected = selected.includes(clone.id);

                // The row stays click-to-select for pointer users, but it is not an ARIA
                // button: it contains a real link, and a focusable descendant inside a
                // role="button" both breaks screen readers and swallows Enter on the link.
                // Keyboard users get the explicit Compare button in the last column instead.
                return (
                    <div
                        key={clone.id}
                        onClick={() => toggleSelect(clone.id)}
                        className={`group relative grid ${CLONE_ROW_GRID} gap-x-4 items-center px-6 py-[15px] border-b hairline cursor-pointer transition-colors duration-150 ${
                            isSelected
                                ? 'bg-accent/5 dark:bg-accent-soft/[0.06] shadow-[inset_2px_0_0_0_var(--color-accent)]'
                                : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
                        }`}
                    >
                        <div className="min-w-0 relative z-[1]">
                            <div className="truncate">
                                <a
                                    href={`/clones/${clone.id}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="text-[16px] font-medium tracking-[-0.01em] hover:underline underline-offset-4 decoration-1"
                                >
                                    {clone.name}
                                </a>
                                {clone.health && (
                                    <span className="ml-2 align-middle font-mono text-[10px] uppercase tracking-[0.12em] text-amber-600 dark:text-amber-400 border border-amber-600/40 dark:border-amber-400/40 px-1.5 py-0.5 rounded-sm">
                                        {clone.health}
                                    </span>
                                )}
                                <span className="ml-2 font-mono text-[11px] text-pale-slate-400 hidden 2xl:inline">{clone.repoPath}</span>
                            </div>
                            <div className="sm:hidden mt-1 font-mono text-[11px] text-pale-slate-500 truncate pointer-events-none">
                                {formatRowSubline(clone)}
                            </div>
                        </div>
                        <div className="hidden sm:block font-mono text-[11px] text-pale-slate-500 truncate relative z-[1] pointer-events-none">{clone.language}</div>
                        <div className="font-mono text-[13px] text-right tabular-nums text-pale-slate-700 dark:text-pale-slate-300 relative z-[1] pointer-events-none">{formatStars(clone.stars)}</div>
                        <div className="hidden sm:block font-mono text-[13px] text-right tabular-nums text-pale-slate-700 dark:text-pale-slate-300 relative z-[1] pointer-events-none">{clone.memoryMb ? `${clone.memoryMb} MB` : '—'}</div>
                        <div className={`hidden lg:block font-mono text-[13px] text-right tabular-nums relative z-[1] pointer-events-none ${securityTone(clone.securityScore)}`}>{clone.securityScore ?? '—'}</div>
                        <div className="hidden xl:block font-mono text-[11px] text-right truncate text-pale-slate-500 relative z-[1] pointer-events-none">{clone.license ?? '—'}</div>
                        <div className="hidden lg:block font-mono text-[13px] text-right tabular-nums text-pale-slate-700 dark:text-pale-slate-300 whitespace-nowrap relative z-[1] pointer-events-none">{formatCommitDate(clone.lastCommitAt)}</div>
                        <div className="justify-self-end relative z-[1]">
                            <button
                                type="button"
                                aria-pressed={isSelected}
                                aria-label={isSelected ? `Remove ${clone.name} from the comparison` : `Add ${clone.name} to the comparison`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    toggleSelect(clone.id);
                                }}
                                // Always visible on touch layouts — there is no hover to reveal it there.
                                className={`font-mono text-[11px] border hairline rounded-sm px-2 py-1 whitespace-nowrap cursor-pointer transition-opacity duration-150 ${
                                    isSelected
                                        ? 'opacity-100 text-accent dark:text-accent-soft border-accent/45 dark:border-accent-soft/45'
                                        : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 text-pale-slate-500 dark:text-pale-slate-400'
                                }`}
                            >
                                {isSelected ? '✓ Added' : 'Compare +'}
                            </button>
                        </div>
                    </div>
                );
            })}

            {rows.length === 0 && (
                <div className="px-6 py-12 text-center font-mono text-[13px] text-pale-slate-500">
                    No alternatives match this filter.
                </div>
            )}

            {selected.length > 0 && (
                <div className="fixed bottom-0 inset-x-0 z-50 border-t hairline bg-paper">
                    <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 overflow-x-auto">
                            {selectedClones.map((clone) => (
                                <button
                                    key={clone.id}
                                    type="button"
                                    onClick={() => toggleSelect(clone.id)}
                                    className="font-mono text-[12px] border hairline rounded-sm px-2.5 py-1.5 hover:text-red-700 dark:hover:text-red-400 transition-colors duration-150 whitespace-nowrap"
                                >
                                    {clone.name} <span className="text-pale-slate-400">×</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                            {/* The over-limit warning has to survive on touch layouts: tapping a
                                third row is otherwise silently ignored. */}
                            <span
                                className={`font-mono text-[11px] text-right ${
                                    overflowHint > 0 ? 'text-accent dark:text-accent-soft' : 'hidden sm:block text-pale-slate-400'
                                }`}
                                role="status"
                                aria-live="polite"
                            >
                                {overflowHint > 0 ? 'Max 2 — remove one first' : `${selected.length} of ${MAX_SELECTED} selected`}
                            </span>
                            {compareHref ? (
                                <a
                                    href={compareHref}
                                    className="btn-primary"
                                >
                                    Compare →
                                </a>
                            ) : (
                                <span className="btn-primary opacity-40">
                                    Compare →
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
