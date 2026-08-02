/**
 * Ecosystem-level report data for `/analysis`.
 *
 * Everything the report states as fact is computed here from the tracked
 * clone collection and the star history, never written by the model. The
 * previous version asked an LLM to retype 42x3 metrics into a markdown table
 * and 22 of 32 rows ended up contradicting the profiles the same site serves;
 * the model now only receives the digest this module produces and writes the
 * connective copy around it.
 *
 * The module is deliberately free of Astro imports so the weekly generator
 * script can build the identical digest the page renders.
 */

/** Flat projection of a clone, built by both the page and the generator. */
export interface AnalysisFacts {
    /** Profile slug, used for `/clones/<slug>` links. */
    slug: string;
    /** `owner/repo`, the key used by `history.json`. */
    repo: string;
    name: string;
    language: string;
    stars: number;
    bootMs: number;
    memoryMb: number;
    securityScore: number;
    sandboxing: number;
    shellAccessRisk: number;
    telemetrySafety: number;
    localFirst: boolean | null;
    cloudDependency: string;
    multiUser: boolean | null;
    license: string | null;
    lastUpdated: string;
}

type FactsSource = {
    id: string;
    data: {
        id: string;
        name: string;
        language: string;
        github_stars: number;
        metrics: { boot_time_ms: number; memory_mb: number; security_score: number };
        radar_chart: {
            sandboxing: number;
            shell_access_risk: number;
            telemetry_safety: number;
        };
        local_first?: boolean | null;
        cloud_dependency?: string;
        multi_user?: boolean | null;
        license_type?: string | null;
        last_updated: string;
    };
};

export type StarHistory = Record<string, { date: string; stars: number }[]>;

export function toAnalysisFacts(clone: FactsSource): AnalysisFacts {
    return {
        slug: clone.id,
        repo: clone.data.id,
        name: clone.data.name,
        language: clone.data.language,
        stars: clone.data.github_stars,
        bootMs: clone.data.metrics.boot_time_ms,
        memoryMb: clone.data.metrics.memory_mb,
        securityScore: clone.data.metrics.security_score,
        sandboxing: clone.data.radar_chart.sandboxing,
        shellAccessRisk: clone.data.radar_chart.shell_access_risk,
        telemetrySafety: clone.data.radar_chart.telemetry_safety,
        localFirst: clone.data.local_first ?? null,
        cloudDependency: clone.data.cloud_dependency ?? 'unknown',
        multiUser: clone.data.multi_user ?? null,
        license: clone.data.license_type && clone.data.license_type !== 'NOASSERTION'
            ? clone.data.license_type
            : null,
        lastUpdated: clone.data.last_updated,
    };
}

export interface Mover {
    slug: string;
    name: string;
    stars: number;
    delta: number;
    percent: number;
}

export interface Archetype {
    key: string;
    label: string;
    rule: string;
    description: string;
    members: AnalysisFacts[];
    medianMemoryMb: number;
    medianBootMs: number;
    medianSecurity: number;
}

export interface SecurityCohort {
    key: string;
    label: string;
    rule: string;
    count: number;
    avgSecurity: number;
    medianSandboxing: number;
    medianShellRisk: number;
    medianTelemetry: number;
}

export interface AnalysisReport {
    /** Latest `last_updated` across the collection: the honest as-of date. */
    dataAsOf: string;
    trackedCount: number;
    /** Window actually measured, so a stalled pipeline cannot read as "this week". */
    window: { start: string; end: string; days: number } | null;
    movement: {
        covered: number;
        gainers: Mover[];
        surgers: Mover[];
        flat: number;
        totalDelta: number;
    };
    archetypes: Archetype[];
    security: {
        cohorts: SecurityCohort[];
        hardened: number;
        exposedShell: number;
        medianSecurity: number;
    };
    posture: {
        localFirst: number;
        cloudOptional: number;
        cloudRequired: number;
        multiUser: number;
        licenses: { label: string; count: number }[];
        unlicensed: number;
    };
    languages: { label: string; count: number; medianMemoryMb: number }[];
}

/** Compiled, single-binary runtimes vs. interpreted ones — the split the security numbers track. */
const NATIVE_LANGUAGES = new Set(['Rust', 'Go', 'Zig', 'C', 'C++', 'Kotlin']);

const MOVER_LIMIT = 6;
const WINDOW_DAYS = 7;

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const value = sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
    return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function toDayNumber(date: string): number {
    return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
}

/**
 * Early history rows were backfilled with negative placeholder counts, so a
 * point only counts as an observation once it carries a real star total.
 */
function realPoints(series: { date: string; stars: number }[]) {
    return series
        .filter((point) => point.stars > 0)
        .sort((left, right) => left.date.localeCompare(right.date));
}

function valueAtOrBefore(
    points: { date: string; stars: number }[],
    limit: string,
): { date: string; stars: number } | null {
    let found: { date: string; stars: number } | null = null;
    for (const point of points) {
        if (point.date <= limit) found = point;
        else break;
    }
    return found;
}

function buildMovement(facts: AnalysisFacts[], history: StarHistory) {
    // The window is anchored to the freshest observation in the data, not to
    // today: when the refresh workflow stalls, the report says so instead of
    // silently reporting a week of zeros.
    let end = '';
    for (const fact of facts) {
        const points = realPoints(history[fact.repo] ?? []);
        const last = points[points.length - 1];
        if (last && last.date > end) end = last.date;
    }
    if (!end) {
        return {
            window: null,
            movement: { covered: 0, gainers: [], surgers: [], flat: 0, totalDelta: 0 },
        };
    }

    const startLimit = new Date(`${end}T00:00:00Z`);
    startLimit.setUTCDate(startLimit.getUTCDate() - WINDOW_DAYS);
    const startDate = startLimit.toISOString().slice(0, 10);

    const movers: Mover[] = [];
    let actualStart = startDate;
    for (const fact of facts) {
        const points = realPoints(history[fact.repo] ?? []);
        if (points.length === 0) continue;
        const endPoint = valueAtOrBefore(points, end);
        const startPoint = valueAtOrBefore(points, startDate);
        if (!endPoint || !startPoint || startPoint.date === endPoint.date) continue;
        if (startPoint.date < actualStart) actualStart = startPoint.date;
        const delta = endPoint.stars - startPoint.stars;
        movers.push({
            slug: fact.slug,
            name: fact.name,
            stars: endPoint.stars,
            delta,
            percent: Math.round((delta / startPoint.stars) * 1000) / 10,
        });
    }

    const gainers = [...movers]
        .filter((mover) => mover.delta > 0)
        .sort((left, right) => right.delta - left.delta)
        .slice(0, MOVER_LIMIT);
    const surgers = [...movers]
        .filter((mover) => mover.delta > 0)
        .sort((left, right) => right.percent - left.percent)
        .slice(0, MOVER_LIMIT);

    return {
        window: { start: actualStart, end, days: toDayNumber(end) - toDayNumber(actualStart) },
        movement: {
            covered: movers.length,
            gainers,
            surgers,
            flat: movers.filter((mover) => mover.delta <= 0).length,
            totalDelta: movers.reduce((total, mover) => total + mover.delta, 0),
        },
    };
}

/**
 * Ordered rules, first match wins, so every tracked project lands in exactly
 * one bucket. The old prose taxonomy listed KafClaw under two archetypes and
 * left ten projects out entirely.
 */
const ARCHETYPE_RULES: {
    key: string;
    label: string;
    rule: string;
    description: string;
    matches: (fact: AnalysisFacts) => boolean;
}[] = [
    {
        key: 'edge',
        label: 'Edge & minimalist',
        rule: 'Memory ≤ 20 MB and boot ≤ 50 ms',
        description:
            'Single-binary runtimes small enough for a tiny VPS, an ARM board, or an always-on background process.',
        matches: (fact) => fact.memoryMb <= 20 && fact.bootMs <= 50,
    },
    {
        key: 'team',
        label: 'Team & multi-tenant',
        rule: 'Multi-user declared, above the edge footprint',
        description:
            'Heavier runtimes that carry shared workspaces, tenant separation, or channel fan-out for a group.',
        matches: (fact) => fact.multiUser === true,
    },
    {
        key: 'assistant',
        label: 'Full-runtime assistant',
        rule: 'Everything else',
        description:
            'Single-operator assistants that keep the reference feature surface and pay for it in memory and boot time.',
        matches: () => true,
    },
];

function buildArchetypes(facts: AnalysisFacts[]): Archetype[] {
    const buckets = new Map<string, AnalysisFacts[]>(
        ARCHETYPE_RULES.map((rule) => [rule.key, []]),
    );
    for (const fact of facts) {
        const rule = ARCHETYPE_RULES.find((candidate) => candidate.matches(fact));
        if (rule) buckets.get(rule.key)!.push(fact);
    }

    return ARCHETYPE_RULES.map((rule) => {
        const members = (buckets.get(rule.key) ?? []).sort(
            (left, right) => right.stars - left.stars,
        );
        return {
            key: rule.key,
            label: rule.label,
            rule: rule.rule,
            description: rule.description,
            members,
            medianMemoryMb: median(members.map((member) => member.memoryMb)),
            medianBootMs: median(members.map((member) => member.bootMs)),
            medianSecurity: median(members.map((member) => member.securityScore)),
        };
    }).filter((archetype) => archetype.members.length > 0);
}

function buildSecurity(facts: AnalysisFacts[]) {
    const cohortDefs = [
        {
            key: 'native',
            label: 'Compiled runtimes',
            rule: 'Rust, Go, Zig, C, C++, Kotlin',
            members: facts.filter((fact) => NATIVE_LANGUAGES.has(fact.language)),
        },
        {
            key: 'scripted',
            label: 'Scripting runtimes',
            rule: 'Python, TypeScript, JavaScript and friends',
            members: facts.filter((fact) => !NATIVE_LANGUAGES.has(fact.language)),
        },
    ];

    return {
        cohorts: cohortDefs
            .filter((cohort) => cohort.members.length > 0)
            .map((cohort) => ({
                key: cohort.key,
                label: cohort.label,
                rule: cohort.rule,
                count: cohort.members.length,
                avgSecurity: average(cohort.members.map((member) => member.securityScore)),
                medianSandboxing: median(cohort.members.map((member) => member.sandboxing)),
                medianShellRisk: median(cohort.members.map((member) => member.shellAccessRisk)),
                medianTelemetry: median(cohort.members.map((member) => member.telemetrySafety)),
            })),
        hardened: facts.filter(
            (fact) => fact.securityScore >= 85 && fact.shellAccessRisk <= 4,
        ).length,
        exposedShell: facts.filter((fact) => fact.shellAccessRisk >= 8).length,
        medianSecurity: median(facts.map((fact) => fact.securityScore)),
    };
}

function buildPosture(facts: AnalysisFacts[]) {
    const licenseCounts = new Map<string, number>();
    for (const fact of facts) {
        if (!fact.license) continue;
        licenseCounts.set(fact.license, (licenseCounts.get(fact.license) ?? 0) + 1);
    }

    return {
        localFirst: facts.filter((fact) => fact.localFirst === true).length,
        cloudOptional: facts.filter((fact) => fact.cloudDependency === 'optional').length,
        cloudRequired: facts.filter((fact) => fact.cloudDependency === 'required').length,
        multiUser: facts.filter((fact) => fact.multiUser === true).length,
        licenses: [...licenseCounts.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((left, right) => right.count - left.count),
        unlicensed: facts.filter((fact) => !fact.license).length,
    };
}

function buildLanguages(facts: AnalysisFacts[]) {
    const grouped = new Map<string, AnalysisFacts[]>();
    for (const fact of facts) {
        const bucket = grouped.get(fact.language) ?? [];
        bucket.push(fact);
        grouped.set(fact.language, bucket);
    }

    return [...grouped.entries()]
        .map(([label, members]) => ({
            label,
            count: members.length,
            medianMemoryMb: median(members.map((member) => member.memoryMb)),
        }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function buildAnalysisReport(
    facts: AnalysisFacts[],
    history: StarHistory,
): AnalysisReport {
    const { window, movement } = buildMovement(facts, history);

    return {
        dataAsOf: facts.reduce(
            (latest, fact) => (fact.lastUpdated > latest ? fact.lastUpdated : latest),
            facts[0]?.lastUpdated ?? '',
        ),
        trackedCount: facts.length,
        window,
        movement,
        archetypes: buildArchetypes(facts),
        security: buildSecurity(facts),
        posture: buildPosture(facts),
        languages: buildLanguages(facts),
    };
}

/**
 * Purely computed headline facts. These render whenever the weekly narrative
 * is missing, stale or was rejected by the number guard, so the report never
 * degrades to an empty page the way a failed markdown generation used to.
 */
export function buildComputedHighlights(report: AnalysisReport): string[] {
    const highlights: string[] = [];
    const topGainer = report.movement.gainers[0];
    const topSurger = report.movement.surgers[0];
    const edge = report.archetypes.find((archetype) => archetype.key === 'edge');
    const [nativeCohort, scriptedCohort] = report.security.cohorts;

    if (topGainer && report.window) {
        highlights.push(
            `${topGainer.name} added the most stars over the ${report.window.days}-day window: +${topGainer.delta.toLocaleString('en-US')}, to ${topGainer.stars.toLocaleString('en-US')}.`,
        );
    }
    if (topSurger && topSurger.slug !== topGainer?.slug) {
        highlights.push(
            `${topSurger.name} grew fastest in relative terms at +${topSurger.percent}%.`,
        );
    }
    if (report.movement.covered > 0) {
        highlights.push(
            `${report.movement.flat} of ${report.movement.covered} tracked projects gained nothing over the window.`,
        );
    }
    if (edge) {
        highlights.push(
            `${edge.members.length} of ${report.trackedCount} projects clear the edge bar (${edge.rule}), at a median of ${edge.medianMemoryMb} MB.`,
        );
    }
    if (nativeCohort && scriptedCohort) {
        highlights.push(
            `Compiled runtimes average ${nativeCohort.avgSecurity}/100 on security against ${scriptedCohort.avgSecurity}/100 for scripting runtimes.`,
        );
    }
    highlights.push(
        `${report.posture.localFirst} of ${report.trackedCount} run local-first, and ${report.posture.cloudRequired} still require a hosted service.`,
    );

    return highlights.slice(0, 5);
}

/**
 * Compact, model-facing view of the report. The generator sends this instead
 * of 170 KB of raw clone JSON — the old prompt spent ~43k tokens per run and
 * still dropped the two largest projects out of the tail of its own tables.
 */
export function buildNarrativeDigest(report: AnalysisReport) {
    return {
        data_as_of: report.dataAsOf.slice(0, 10),
        tracked_projects: report.trackedCount,
        window: report.window
            ? `${report.window.start} to ${report.window.end} (${report.window.days} days)`
            : 'no star history available',
        movement: {
            projects_with_history: report.movement.covered,
            total_new_stars: report.movement.totalDelta,
            flat_or_declining: report.movement.flat,
            biggest_absolute: report.movement.gainers.map(
                (mover) => `${mover.name} +${mover.delta} to ${mover.stars}`,
            ),
            fastest_percent: report.movement.surgers.map(
                (mover) => `${mover.name} +${mover.percent}%`,
            ),
        },
        architecture: report.archetypes.map((archetype) => ({
            label: archetype.label,
            rule: archetype.rule,
            count: archetype.members.length,
            median_memory_mb: archetype.medianMemoryMb,
            median_boot_ms: archetype.medianBootMs,
            median_security: archetype.medianSecurity,
            largest: archetype.members.slice(0, 4).map((member) => member.name),
        })),
        security: {
            median_security_score: report.security.medianSecurity,
            hardened_projects: report.security.hardened,
            unsupervised_shell_projects: report.security.exposedShell,
            cohorts: report.security.cohorts.map((cohort) => ({
                label: cohort.label,
                count: cohort.count,
                avg_security: cohort.avgSecurity,
                median_sandboxing: cohort.medianSandboxing,
                median_shell_risk: cohort.medianShellRisk,
                median_telemetry_safety: cohort.medianTelemetry,
            })),
        },
        posture: {
            local_first: report.posture.localFirst,
            cloud_optional: report.posture.cloudOptional,
            cloud_required: report.posture.cloudRequired,
            multi_user: report.posture.multiUser,
            licenses: report.posture.licenses.map(
                (license) => `${license.label}: ${license.count}`,
            ),
            license_unknown: report.posture.unlicensed,
        },
        languages: report.languages.map(
            (language) =>
                `${language.label}: ${language.count} ${language.count === 1 ? 'project' : 'projects'}, median ${language.medianMemoryMb} MB`,
        ),
    };
}

/**
 * Every number the copy is allowed to contain. The generator drops any
 * sentence quoting a figure outside this set, which is what keeps the
 * narrative from re-introducing the invented metrics of the old report.
 */
export function collectAllowedNumbers(report: AnalysisReport): Set<string> {
    const allowed = new Set<string>();
    const add = (value: number | undefined | null) => {
        if (typeof value !== 'number' || Number.isNaN(value)) return;
        allowed.add(String(value));
        allowed.add(String(Math.round(value)));
        allowed.add(String(Math.abs(value)));
    };

    // Scale bounds the copy may cite when describing an axis ("7 out of 10").
    // Nothing else is whitelisted wholesale: an earlier version allowed every
    // integer up to the project count, which quietly re-admitted most of the
    // invented small metrics the guard exists to catch.
    add(0);
    add(1);
    add(10);
    add(100);

    // Structural counts the copy can reasonably cite — "three cohorts" — that
    // are implied by the digest's shape rather than listed as values.
    add(report.archetypes.length);
    add(report.security.cohorts.length);
    add(report.languages.length);
    add(report.posture.licenses.length);

    add(report.trackedCount);
    add(report.movement.covered);
    add(report.movement.flat);
    add(report.movement.totalDelta);
    add(report.security.hardened);
    add(report.security.exposedShell);
    add(report.security.medianSecurity);
    add(report.posture.localFirst);
    add(report.posture.cloudOptional);
    add(report.posture.cloudRequired);
    add(report.posture.multiUser);
    add(report.posture.unlicensed);

    for (const mover of [...report.movement.gainers, ...report.movement.surgers]) {
        add(mover.delta);
        add(mover.percent);
        add(mover.stars);
    }
    for (const archetype of report.archetypes) {
        add(archetype.members.length);
        add(archetype.medianMemoryMb);
        add(archetype.medianBootMs);
        add(archetype.medianSecurity);
    }
    for (const cohort of report.security.cohorts) {
        add(cohort.count);
        add(cohort.avgSecurity);
        add(cohort.medianSandboxing);
        add(cohort.medianShellRisk);
        add(cohort.medianTelemetry);
    }
    for (const license of report.posture.licenses) {
        add(license.count);
        // `AGPL-3.0` and `Apache-2.0` carry digits that are part of a name, not
        // a figure; without this the guard rejected a paragraph for quoting
        // "3.0" and "2.0".
        for (const token of license.label.match(/\d+(?:\.\d+)?/g) ?? []) allowed.add(token);
    }
    for (const language of report.languages) {
        add(language.count);
        add(language.medianMemoryMb);
    }
    if (report.window) {
        add(report.window.days);
        allowed.add(report.window.start.slice(0, 4));
    }
    allowed.add(report.dataAsOf.slice(0, 4));

    return allowed;
}

const NUMBER_WORDS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
    seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Rewrites English cardinals as digits so the guard can check them.
 *
 * Models reach for words at the start of a sentence — "Fourteen projects were
 * flat" — which sailed straight past a check that only ever looked at digits.
 * Banning the style cost too much good copy, so the words are converted and
 * then verified like any other figure. The original text is left untouched;
 * this is only what the checker reads.
 */
export function normaliseNumberWords(text: string): string {
    const tens = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
    const ones = 'one|two|three|four|five|six|seven|eight|nine';
    return text
        .replace(new RegExp(`\\b(${tens})[- ](${ones})\\b`, 'gi'), (_m, t: string, o: string) =>
            String(NUMBER_WORDS[t.toLowerCase()] + NUMBER_WORDS[o.toLowerCase()]),
        )
        .replace(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi'), (m) =>
            String(NUMBER_WORDS[m.toLowerCase()]),
        );
}

/**
 * Returns the figures a string quotes that the report cannot back. Star counts
 * are commonly written as `45.8k`, so the `k` suffix is expanded before the
 * lookup rather than treated as a separate token.
 */
export function findUnbackedNumbers(text: string, allowed: Set<string>): string[] {
    const tokens = normaliseNumberWords(text).match(/\d+(?:[.,]\d+)?k?/gi) ?? [];
    const values = [...allowed].map(Number).filter(Number.isFinite);
    const unbacked: string[] = [];

    for (const token of tokens) {
        const normalized = token.replace(/,/g, '');
        if (allowed.has(normalized)) continue;

        const numeric = /k$/i.test(normalized)
            ? parseFloat(normalized) * 1000
            : Number(normalized);
        if (!Number.isFinite(numeric)) {
            unbacked.push(token);
            continue;
        }

        // Rounded figures read better than exact ones — "385k" for 384,899,
        // "4,600" for 4,605 — and rejecting them cost most of the copy in a run
        // where every number was true. A token is accepted when it lands within
        // 3% of a figure the report holds, which admits a rounding of a real
        // value without admitting an invented one.
        const backed = values.some(
            (value) => Math.abs(numeric - value) <= Math.max(1, Math.abs(value) * 0.03),
        );
        if (!backed) unbacked.push(token);
    }

    return unbacked;
}
