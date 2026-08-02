import type { CollectionEntry } from 'astro:content';
import {
    formatSignalDate,
    getConfidenceDetail,
    getConfidenceLabel,
    getConfidenceTone,
    getFreshnessState,
} from '../lib/content-signals';
import { dedupeStrings, getCloneText } from '../lib/use-cases';
import { getDisplayName } from '../lib/clone-format';

type CloneEntry = CollectionEntry<'clones'>;

interface CloneOption {
    id: string;
    name: string;
    slug: string;
}

interface CompareDashboardProps {
    cloneOptions: CloneOption[];
    initialClone1: CloneEntry;
    initialClone2: CloneEntry;
}

type DecisionValue = {
    label: string;
    detail: string;
    score: number;
    source: 'structured' | 'derived';
};

type DecisionRowData = {
    label: string;
    hint: string;
    left: DecisionValue;
    right: DecisionValue;
};

type MetricRowData = {
    label: string;
    value1: string;
    value2: string;
    differs: boolean;
};

function formatStars(stars: number): string {
    return stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10_000 ? 0 : 1)}k` : String(stars);
}

function buildMetricRows(clone1: CloneEntry, clone2: CloneEntry): MetricRowData[] {
    const row = <T,>(label: string, raw1: T, raw2: T, format: (value: T) => string): MetricRowData => ({
        label,
        value1: format(raw1),
        value2: format(raw2),
        differs: raw1 !== raw2,
    });

    return [
        row('Stars', clone1.data.github_stars, clone2.data.github_stars, formatStars),
        row('Memory', clone1.data.metrics.memory_mb, clone2.data.metrics.memory_mb, (v) => `${v} MB`),
        row('Language', clone1.data.language, clone2.data.language, (v) => v),
        row('License', clone1.data.license_type || 'Unknown', clone2.data.license_type || 'Unknown', (v) => v),
        row('Last commit', clone1.data.last_commit_at ?? null, clone2.data.last_commit_at ?? null, (v) => (v ? formatSignalDate(v) : '—')),
        row('Release cadence', clone1.data.release_cadence_days ?? null, clone2.data.release_cadence_days ?? null, (v) => (v ? `~${v} days` : '—')),
        row('Sentiment', clone1.data.community_sentiment, clone2.data.community_sentiment, (v) => `${v} / 100`),
        row('Security score', clone1.data.metrics.security_score, clone2.data.metrics.security_score, (v) => `${v} / 100`),
    ];
}

function sourceLabel(source: 'structured' | 'derived'): string {
    return source === 'structured' ? 'AI field' : 'Repo fallback';
}

function winnerSide(left: DecisionValue, right: DecisionValue): 'left' | 'right' | 'draw' {
    if (Math.abs(left.score - right.score) < 8) return 'draw';
    return left.score > right.score ? 'left' : 'right';
}

function buildDecisionValue(label: string, detail: string, score: number, source: 'structured' | 'derived'): DecisionValue {
    return { label, detail, score, source };
}

function deriveSetupDifficulty(clone: CloneEntry): DecisionValue {
    switch (clone.data.setup_difficulty) {
        case 'low':
            return buildDecisionValue('Low friction', 'Structured field says setup stays lightweight.', 88, 'structured');
        case 'medium':
            return buildDecisionValue('Moderate setup', 'Structured field says setup is manageable but not instant.', 62, 'structured');
        case 'high':
            return buildDecisionValue('Higher lift', 'Structured field says onboarding or operations take more work.', 30, 'structured');
        default:
            break;
    }

    const text = getCloneText(clone);

    if (
        text.includes('zero-setup') ||
        text.includes('zero setup') ||
        text.includes('no config') ||
        text.includes('no configuration') ||
        text.includes('single-binary') ||
        text.includes('single binary') ||
        text.includes('minimal')
    ) {
        return buildDecisionValue('Low friction', 'Derived from zero-setup or minimalist positioning.', 84, 'derived');
    }

    if (text.includes('enterprise') || text.includes('workspace') || text.includes('orchestration')) {
        return buildDecisionValue('Higher lift', 'Derived from platform or workspace-style setup requirements.', 36, 'derived');
    }

    if (text.includes('container') || text.includes('desktop app') || text.includes('cross-platform')) {
        return buildDecisionValue('Moderate setup', 'Derived from packaging and runtime requirements.', 56, 'derived');
    }

    return buildDecisionValue('Moderate setup', 'Estimated from the current product and repo signals.', 58, 'derived');
}

function derivePrivacyPosture(clone: CloneEntry): DecisionValue {
    switch (clone.data.privacy_posture) {
        case 'strong':
            return buildDecisionValue('Strong defaults', 'Structured field points to stronger privacy posture.', 90, 'structured');
        case 'mixed':
            return buildDecisionValue('Mixed posture', 'Structured field says privacy depends on configuration choices.', 60, 'structured');
        case 'weak':
            return buildDecisionValue('Weaker defaults', 'Structured field suggests more exposure by default.', 28, 'structured');
        default:
            break;
    }

    const text = getCloneText(clone);
    const { security_score } = clone.data.metrics;
    const { network_isolation, telemetry_safety, shell_access_risk, sandboxing } = clone.data.radar_chart;

    if (security_score >= 85 && network_isolation >= 8 && telemetry_safety >= 7 && shell_access_risk <= 4) {
        return buildDecisionValue('Strong defaults', 'Derived from strong isolation, telemetry safety, and lower shell risk.', 90, 'derived');
    }

    if (
        text.includes('local-first') ||
        text.includes('offline') ||
        text.includes('on-device') ||
        text.includes('sandbox') ||
        text.includes('container') ||
        sandboxing >= 8
    ) {
        return buildDecisionValue('Strong-leaning', 'Derived from local-first or containment-oriented signals.', 78, 'derived');
    }

    if (security_score < 55 || shell_access_risk >= 8) {
        return buildDecisionValue('Needs hardening', 'Derived from weaker security signals or elevated execution risk.', 30, 'derived');
    }

    return buildDecisionValue('Mixed posture', 'Estimated from available security and architecture evidence.', 58, 'derived');
}

function deriveCloudDependency(clone: CloneEntry): DecisionValue {
    switch (clone.data.cloud_dependency) {
        case 'none':
            return buildDecisionValue('No cloud required', 'Structured field says the core path stays local.', 92, 'structured');
        case 'optional':
            return buildDecisionValue('Optional cloud', 'Structured field says cloud use is a choice, not a hard requirement.', 66, 'structured');
        case 'required':
            return buildDecisionValue('Cloud required', 'Structured field says the product depends on external services.', 24, 'structured');
        default:
            break;
    }

    const text = getCloneText(clone);

    if (clone.data.local_first === true || text.includes('local-first') || text.includes('offline') || text.includes('on-device')) {
        return buildDecisionValue('Mostly local', 'Derived from local-first or offline positioning.', 88, 'derived');
    }

    if (text.includes('api key') || text.includes('bring your own api') || text.includes('supports any api key')) {
        return buildDecisionValue('Optional cloud', 'Derived from bring-your-own-model or API-key language.', 64, 'derived');
    }

    if (text.includes('hosted') || text.includes('cloud-only') || text.includes('managed service')) {
        return buildDecisionValue('Cloud leaning', 'Derived from hosted-service positioning.', 30, 'derived');
    }

    return buildDecisionValue('Dependency unclear', 'Current sources do not make the cloud path explicit yet.', 48, 'derived');
}

function deriveDocsQuality(clone: CloneEntry): DecisionValue {
    const hasRelease = Boolean(clone.data.latest_release?.date);
    const hasOverview = Boolean(clone.data.overview_markdown);

    if (clone.data.github_stars >= 20000 && hasRelease && clone.data.health_status === 'healthy') {
        return buildDecisionValue('Stronger signals', 'Estimated from maturity, public traction, and recent release activity.', 84, 'derived');
    }

    if (clone.data.github_stars >= 5000 && hasOverview && clone.data.health_status !== 'abandoned') {
        return buildDecisionValue('Solid signals', 'Estimated from community size plus maintained project narrative.', 70, 'derived');
    }

    if (clone.data.github_stars >= 1000 || hasOverview) {
        return buildDecisionValue('Developing signals', 'There is enough public context to onboard, but not premium certainty.', 56, 'derived');
    }

    return buildDecisionValue('Thin signals', 'Docs quality is inferred from limited public evidence today.', 34, 'derived');
}

function deriveTeamFit(clone: CloneEntry): DecisionValue {
    if (clone.data.multi_user === true) {
        return buildDecisionValue('Team-ready', 'Structured field says multi-user workflows are supported.', 88, 'structured');
    }

    if (clone.data.multi_user === false) {
        return buildDecisionValue('Solo-first', 'Structured field says shared workflows are not a main focus.', 32, 'structured');
    }

    const text = getCloneText(clone);

    if (
        text.includes('team') ||
        text.includes('multi-user') ||
        text.includes('workspace') ||
        text.includes('cowork') ||
        text.includes('slack') ||
        text.includes('discord')
    ) {
        return buildDecisionValue('Team-ready', 'Derived from shared-workspace or collaboration language.', 82, 'derived');
    }

    if (clone.data.github_stars >= 10000 && clone.data.community_sentiment >= 75) {
        return buildDecisionValue('Team-capable', 'Strong traction suggests better odds of deployment support for teams.', 62, 'derived');
    }

    return buildDecisionValue('Solo leaning', 'Current evidence points more toward personal or builder-centric usage.', 42, 'derived');
}

function derivePluginMaturity(clone: CloneEntry): DecisionValue {
    switch (clone.data.plugin_ecosystem) {
        case 'strong':
            return buildDecisionValue('Strong ecosystem', 'Structured field says extensions and integrations are mature.', 88, 'structured');
        case 'emerging':
            return buildDecisionValue('Emerging ecosystem', 'Structured field says integrations are promising but still growing.', 64, 'structured');
        case 'limited':
            return buildDecisionValue('Limited ecosystem', 'Structured field says extension depth is still narrow.', 34, 'structured');
        default:
            break;
    }

    const text = getCloneText(clone);

    if (text.includes('marketplace') || text.includes('hub')) {
        return buildDecisionValue('Strong ecosystem', 'Derived from marketplace or hub-style extension language.', 84, 'derived');
    }

    if (text.includes('plugin') || text.includes('skills') || text.includes('extensions') || text.includes('mcp') || text.includes('integration')) {
        return buildDecisionValue('Emerging ecosystem', 'Derived from visible extension and integration patterns.', 62, 'derived');
    }

    return buildDecisionValue('Limited ecosystem', 'Extension depth is not strongly evidenced in the current sources.', 36, 'derived');
}

function deriveOperationalRisk(clone: CloneEntry): DecisionValue {
    switch (clone.data.operational_risk) {
        case 'low':
            return buildDecisionValue('Lower risk', 'Structured field says day-two risk stays relatively contained.', 88, 'structured');
        case 'medium':
            return buildDecisionValue('Managed risk', 'Structured field says operations still need active oversight.', 58, 'structured');
        case 'high':
            return buildDecisionValue('Higher risk', 'Structured field says extra guardrails are likely required.', 26, 'structured');
        default:
            break;
    }

    const { security_score } = clone.data.metrics;
    const { shell_access_risk, sandboxing } = clone.data.radar_chart;

    if (security_score >= 85 && shell_access_risk <= 3 && sandboxing >= 8) {
        return buildDecisionValue('Lower risk', 'Derived from stronger containment and lower execution exposure.', 90, 'derived');
    }

    if (shell_access_risk >= 8 || security_score < 55 || clone.data.health_status === 'abandoned') {
        return buildDecisionValue('Higher risk', 'Derived from elevated shell risk, weaker security score, or poor health.', 24, 'derived');
    }

    return buildDecisionValue('Managed risk', 'Risk looks workable, but still depends on deployment discipline.', 56, 'derived');
}

function getDecisionRows(clone1: CloneEntry, clone2: CloneEntry): DecisionRowData[] {
    return [
        { label: 'Setup Difficulty', hint: 'How much friction you absorb during onboarding and day-one deployment.', left: deriveSetupDifficulty(clone1), right: deriveSetupDifficulty(clone2) },
        { label: 'Privacy Posture', hint: 'Whether the defaults look safer for local, sensitive, or regulated workflows.', left: derivePrivacyPosture(clone1), right: derivePrivacyPosture(clone2) },
        { label: 'Cloud Dependency', hint: 'How much the product appears to rely on hosted services or external APIs.', left: deriveCloudDependency(clone1), right: deriveCloudDependency(clone2) },
        { label: 'Docs Quality', hint: 'An estimate based on release cadence, narrative depth, and public maturity signals.', left: deriveDocsQuality(clone1), right: deriveDocsQuality(clone2) },
        { label: 'Team Fit', hint: 'Whether the workflow looks more solo-first or ready for shared operations.', left: deriveTeamFit(clone1), right: deriveTeamFit(clone2) },
        { label: 'Plugin Maturity', hint: 'How much extension, skill, or integration headroom is visible today.', left: derivePluginMaturity(clone1), right: derivePluginMaturity(clone2) },
        { label: 'Operational Risk', hint: 'How much hardening and monitoring you are likely to own after launch.', left: deriveOperationalRisk(clone1), right: deriveOperationalRisk(clone2) },
    ];
}

function preferenceCopy(label: string): string {
    switch (label) {
        case 'Setup Difficulty':
            return 'you want faster setup and less operational overhead';
        case 'Privacy Posture':
            return 'privacy defaults and containment matter more than raw flexibility';
        case 'Cloud Dependency':
            return 'you want to keep more of the workflow local or optional-cloud';
        case 'Docs Quality':
            return 'you need clearer onboarding and stronger maturity signals';
        case 'Team Fit':
            return 'this will serve teammates, workspaces, or shared operations';
        case 'Plugin Maturity':
            return 'you depend on integrations, skills, or extension headroom';
        case 'Operational Risk':
            return 'you want lower day-two risk and fewer hardening surprises';
        default:
            return 'its current fit matches your constraints better';
    }
}

/**
 * Only reasons backed by an actual signal are returned. The list is deliberately
 * allowed to come back short — or empty — instead of being padded to three with
 * copy that would read as evidence without being any.
 */
function buildChooseIf(side: 'left' | 'right', rows: DecisionRowData[], clone: CloneEntry): string[] {
    const sorted = rows
        .map((row) => ({ label: row.label, diff: side === 'left' ? row.left.score - row.right.score : row.right.score - row.left.score }))
        .filter((row) => row.diff >= 8)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 3)
        .map((row) => preferenceCopy(row.label));

    return dedupeStrings([
        ...sorted,
        ...(clone.data.best_for?.slice(0, 2) || []).map((entry) => `you specifically need ${entry.toLowerCase()}`),
    ]).slice(0, 3);
}

function buildNeitherIf(rows: DecisionRowData[], clone1: CloneEntry, clone2: CloneEntry): string[] {
    const lowByLabel = new Map(rows.map((row) => [row.label, Math.max(row.left.score, row.right.score)]));

    return dedupeStrings([
        (lowByLabel.get('Team Fit') || 0) < 50 ? 'you need a truly polished multi-user platform right now' : null,
        (lowByLabel.get('Plugin Maturity') || 0) < 50 ? 'your workflow depends on a mature plugin or marketplace ecosystem' : null,
        (lowByLabel.get('Docs Quality') || 0) < 55 ? 'you want unusually clear docs and low-friction onboarding from day one' : null,
        (lowByLabel.get('Privacy Posture') || 0) < 55 ? 'you need stronger privacy guarantees than the current evidence supports' : null,
        (lowByLabel.get('Operational Risk') || 0) < 50 ? 'you cannot tolerate meaningful execution or hardening risk' : null,
        (clone1.data.evidence_confidence ?? 35) < 40 && (clone2.data.evidence_confidence ?? 35) < 40
            ? 'you need higher-confidence evidence before making a production choice'
            : null,
    ]).slice(0, 3);
}

/**
 * A reason column. An empty list is a finding in itself, so it says so rather
 * than rendering nothing or being padded with filler.
 */
function ReasonList({
    title,
    items,
    dotClass,
    titleClass = '',
    emptyCopy,
}: {
    title: string;
    items: string[];
    dotClass: string;
    titleClass?: string;
    emptyCopy: string;
}) {
    return (
        <div>
            <h4 className={`eyebrow mb-3 ${titleClass}`}>{title}</h4>
            {items.length > 0 ? (
                <ul className="space-y-3 text-[14px] text-pale-slate-600 dark:text-pale-slate-400 leading-relaxed">
                    {items.map((item) => (
                        <li key={item} className="flex gap-3">
                            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-[14px] leading-relaxed text-pale-slate-500">{emptyCopy}</p>
            )}
        </div>
    );
}

export default function CompareDashboard({ cloneOptions, initialClone1, initialClone2 }: CompareDashboardProps) {
    if (cloneOptions.length < 2) return <div>Not enough clones to compare.</div>;

    const sorted = [...cloneOptions].sort((a, b) => a.name.localeCompare(b.name));

    const handleSelectChange = (slot: 1 | 2, newId: string) => {
        let id1 = slot === 1 ? newId : initialClone1.id;
        let id2 = slot === 2 ? newId : initialClone2.id;

        if (id1 === id2) {
            const alternative = sorted.find((clone) => clone.id !== newId);
            if (alternative) {
                if (slot === 1) id2 = alternative.id;
                else id1 = alternative.id;
            }
        }

        const cloneA = cloneOptions.find((clone) => clone.id === id1);
        const cloneB = cloneOptions.find((clone) => clone.id === id2);
        if (!cloneA || !cloneB) return;

        window.location.href = `/compare/${[cloneA.slug, cloneB.slug].sort().join('-vs-')}`;
    };

    const clone1 = initialClone1;
    const clone2 = initialClone2;
    const name1 = getDisplayName(clone1);
    const name2 = getDisplayName(clone2);
    const metricRows = buildMetricRows(clone1, clone2);
    const decisionRows = getDecisionRows(clone1, clone2);
    const score1 = decisionRows.reduce((total, row) => total + row.left.score, 0) + (clone1.data.evidence_confidence ?? 35) * 0.15;
    const score2 = decisionRows.reduce((total, row) => total + row.right.score, 0) + (clone2.data.evidence_confidence ?? 35) * 0.15;
    const verdictDelta = score1 - score2;
    const verdictWinner = Math.abs(verdictDelta) < 18 ? null : verdictDelta > 0 ? 'left' : 'right';
    const chooseAIf = buildChooseIf('left', decisionRows, clone1);
    const chooseBIf = buildChooseIf('right', decisionRows, clone2);
    const neitherIf = buildNeitherIf(decisionRows, clone1, clone2);
    const clone1Freshness = getFreshnessState(clone1.data);
    const clone2Freshness = getFreshnessState(clone2.data);

    // One label column and two value columns at every width. The previous layout
    // gave each clone its own card with its own copy of the labels, which stacked
    // on mobile into "all of A, then all of B" — the one shape a comparison
    // must never take.
    const COMPARE_GRID = 'grid grid-cols-[minmax(72px,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 sm:gap-x-6';

    const Identity = ({ slot, clone }: { slot: 1 | 2; clone: CloneEntry }) => (
        <div className="min-w-0 flex flex-col gap-2">
            <select
                value={clone.id}
                onChange={(event) => handleSelectChange(slot, event.target.value)}
                aria-label={`Select clone ${slot}`}
                className="w-full font-mono text-[12px] bg-transparent border hairline rounded-sm px-2.5 py-1.5 text-pale-slate-600 dark:text-pale-slate-400 focus:outline-none focus:border-accent dark:focus:border-accent-soft cursor-pointer"
            >
                {sorted.map((option) => (
                    <option key={`${slot}-${option.id}`} value={option.id}>{option.name}</option>
                ))}
            </select>
            <p className="hidden sm:block text-[13px] leading-snug text-pale-slate-600 dark:text-pale-slate-400 line-clamp-2">
                {clone.data.vibe_summary}
            </p>
            <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-pale-slate-500 dark:text-pale-slate-400">
                <span className="truncate">{clone.data.health_status}</span>
                <a
                    href={`/clones/${clone.id}`}
                    className="shrink-0 hover:text-ink dark:hover:text-white transition-colors duration-150"
                >
                    Profile →
                </a>
            </div>
        </div>
    );

    return (
        <div className="w-full">
            <div className="border hairline">
                <div className={`${COMPARE_GRID} items-start px-4 sm:px-6 py-5 border-b hairline`}>
                    <div />
                    <div className="min-w-0">
                        <h2 className="text-[18px] sm:text-[24px] font-semibold tracking-[-0.02em] truncate">{name1}</h2>
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-[18px] sm:text-[24px] font-semibold tracking-[-0.02em] truncate">{name2}</h2>
                    </div>
                </div>

                <div className={`${COMPARE_GRID} items-start px-4 sm:px-6 py-5 border-b hairline`}>
                    <div className="eyebrow pt-2">Pick</div>
                    <Identity slot={1} clone={clone1} />
                    <Identity slot={2} clone={clone2} />
                </div>

                {metricRows.map((row) => (
                    <div
                        key={row.label}
                        className={`${COMPARE_GRID} items-baseline px-4 sm:px-6 py-3.5 border-b hairline last:border-b-0 ${
                            row.differs ? 'bg-accent/[0.05] dark:bg-accent-soft/[0.06]' : ''
                        }`}
                    >
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-pale-slate-400">{row.label}</span>
                        <span className={`font-mono text-[14px] sm:text-[15px] tabular-nums truncate ${row.differs ? 'text-accent dark:text-accent-soft' : 'text-pale-slate-700 dark:text-pale-slate-300'}`}>
                            {row.value1}
                        </span>
                        <span className={`font-mono text-[14px] sm:text-[15px] tabular-nums truncate ${row.differs ? 'text-accent dark:text-accent-soft' : 'text-pale-slate-700 dark:text-pale-slate-300'}`}>
                            {row.value2}
                        </span>
                    </div>
                ))}
            </div>

            <div className="mt-16">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-pale-slate-500">Verdict</h2>
                <div className="mt-6 flex flex-wrap items-center gap-2">
                    <span className={`pill ${getConfidenceTone(clone1.data.evidence_confidence)}`}>
                        {name1} · {getConfidenceLabel(clone1.data.evidence_confidence)}
                    </span>
                    <span className={`pill ${getConfidenceTone(clone2.data.evidence_confidence)}`}>
                        {name2} · {getConfidenceLabel(clone2.data.evidence_confidence)}
                    </span>
                </div>
                <h3 className="mt-6 text-[24px] font-semibold tracking-[-0.01em] max-w-3xl">
                    {verdictWinner === 'left'
                        ? `${name1} has the stronger current case.`
                        : verdictWinner === 'right'
                            ? `${name2} has the stronger current case.`
                            : 'This comparison is close enough to treat as fit-driven.'}
                </h3>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-pale-slate-600 dark:text-pale-slate-400">
                    {getConfidenceDetail(clone1.data.evidence_confidence)} {clone1Freshness.detail} {clone2Freshness.detail}
                </p>

                <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-10">
                    <ReasonList
                        title={`Choose ${name1} if`}
                        items={chooseAIf}
                        dotClass="bg-accent"
                        titleClass="text-accent dark:text-accent-soft"
                        emptyCopy={`No measured axis clearly favours ${name1} over ${name2}.`}
                    />
                    <ReasonList
                        title="Neither if"
                        items={neitherIf}
                        dotClass="bg-pale-slate-500"
                        emptyCopy="Nothing in the current evidence rules both of them out."
                    />
                    <ReasonList
                        title={`Choose ${name2} if`}
                        items={chooseBIf}
                        dotClass="bg-accent"
                        titleClass="text-accent dark:text-accent-soft"
                        emptyCopy={`No measured axis clearly favours ${name2} over ${name1}.`}
                    />
                </div>
            </div>

            <div className="mt-16">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-pale-slate-500">Decision layer</h2>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-pale-slate-600 dark:text-pale-slate-400">
                    These rows combine measured repo signals with structured AI fields when available. When the structured fields are still empty, the fallback is repo evidence — made visible via the source tag.
                </p>
                {/* Collapsed by default: the verdict above already answers "which one",
                    so the seven axes only need to show their call until asked for the
                    reasoning behind it. */}
                <div className="mt-8 border-t hairline">
                    {decisionRows.map((row) => {
                        const winner = winnerSide(row.left, row.right);
                        return (
                            <details key={row.label} className="group border-b hairline">
                                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden py-4">
                                    <div className={`${COMPARE_GRID} items-baseline`}>
                                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-pale-slate-400">
                                            {row.label}
                                        </span>
                                        <span className={`text-[14px] truncate ${winner === 'left' ? 'text-accent dark:text-accent-soft font-medium' : 'text-pale-slate-600 dark:text-pale-slate-400'}`}>
                                            {row.left.label}
                                        </span>
                                        <span className="flex items-baseline justify-between gap-3 min-w-0">
                                            <span className={`min-w-0 truncate text-[14px] ${winner === 'right' ? 'text-accent dark:text-accent-soft font-medium' : 'text-pale-slate-600 dark:text-pale-slate-400'}`}>
                                                {row.right.label}
                                            </span>
                                            <span className="shrink-0 font-mono text-[10px] text-pale-slate-400 group-open:rotate-180 transition-transform duration-200">
                                                ▾
                                            </span>
                                        </span>
                                    </div>
                                </summary>
                                <div className="pb-5">
                                    <p className="text-[13px] leading-relaxed text-pale-slate-500 max-w-2xl">{row.hint}</p>
                                    <p className="mt-2 font-mono text-[11px] text-pale-slate-500">
                                        {winner === 'draw' ? 'Close call' : winner === 'left' ? `${name1} leads` : `${name2} leads`}
                                    </p>
                                    <div className={`${COMPARE_GRID} mt-4`}>
                                        <div />
                                        <div>
                                            <p className="text-[13px] leading-relaxed text-pale-slate-600 dark:text-pale-slate-400">{row.left.detail}</p>
                                            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-pale-slate-400">
                                                {sourceLabel(row.left.source)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[13px] leading-relaxed text-pale-slate-600 dark:text-pale-slate-400">{row.right.detail}</p>
                                            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-pale-slate-400">
                                                {sourceLabel(row.right.source)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </details>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
