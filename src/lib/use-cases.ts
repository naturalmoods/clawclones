import type { CollectionEntry } from 'astro:content';

export type CloneEntry = CollectionEntry<'clones'>;

export type IntentFilter =
    | 'all'
    | 'secure'
    | 'local'
    | 'zero-api'
    | 'teams'
    | 'edge'
    | 'replacement';

export interface CloneGridCategory {
    id: IntentFilter;
    label: string;
    hint: string;
}

export interface UseCaseLandingPage {
    slug: string;
    intent: Exclude<IntentFilter, 'all'>;
    kicker: string;
    title: string;
    description: string;
    intro: string;
    criteria: string[];
    cautions: string[];
}

export const cloneGridCategories: CloneGridCategory[] = [
    { id: 'all', label: 'All Models', hint: 'Full ecosystem view' },
    { id: 'secure', label: 'Most Secure', hint: 'Lower shell and isolation risk' },
    { id: 'local', label: 'Local First', hint: 'Bias toward local data boundaries' },
    { id: 'zero-api', label: 'Zero API Cost', hint: 'Offline or low-bill starting points' },
    { id: 'teams', label: 'For Teams', hint: 'Collaboration and multi-user fit' },
    { id: 'edge', label: 'Edge / Lightweight', hint: 'Fast boot and lean runtime' },
    { id: 'replacement', label: 'OpenClaw Replacements', hint: 'Most complete alternatives first' },
];

export const useCaseLandingPages: UseCaseLandingPage[] = [
    {
        slug: 'privacy',
        intent: 'secure',
        kicker: 'Privacy Guide',
        title: 'Best OpenClaw alternatives for privacy-first self-hosting',
        description:
            'A shortlist for people who care more about containment, local data boundaries, and quieter defaults than about maximum ecosystem breadth.',
        intro:
            'This page favors projects that look safer to run close to sensitive files, personal accounts, or regulated workflows. The ranking blends measured security signals with AI-reviewed recommendation fields, then keeps the freshness and confidence state visible.',
        criteria: [
            'Isolation, sandboxing, and lower shell exposure',
            'Stronger telemetry and network-boundary signals',
            'More local-first or optional-cloud behavior when the evidence supports it',
        ],
        cautions: [
            'High security scores do not replace your own deployment review.',
            'Some privacy claims still rely on AI inference because many repos do not publish exact threat models.',
            'If confidence is mixed or low, use the compare page and primary docs before committing.',
        ],
    },
];

export function getCloneText(clone: CloneEntry): string {
    return [
        clone.data.name,
        clone.data.vibe_summary,
        clone.data.overview_markdown || '',
        clone.data.tags.join(' '),
        clone.data.best_for?.join(' ') || '',
        clone.data.avoid_if?.join(' ') || '',
        clone.data.deployment_target?.join(' ') || '',
        clone.data.openclaw_advantages?.join(' ') || '',
        clone.data.openclaw_disadvantages?.join(' ') || '',
    ]
        .join(' ')
        .toLowerCase();
}

export function dedupeStrings(values: Array<string | undefined | null>): string[] {
    return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function keywordScore(text: string, keywords: string[]): number {
    return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 15 : 0), 0);
}

/** `unknown` and a missing field both score neutral: absence of evidence is not evidence. */
function cloudDependencyScore(
    clone: CloneEntry,
    weights: { none: number; optional: number; required: number },
): number {
    switch (clone.data.cloud_dependency) {
        case 'none':
            return weights.none;
        case 'optional':
            return weights.optional;
        case 'required':
            return weights.required;
        default:
            return 0;
    }
}

/**
 * Detected provider wiring, for the two intents where it is direct evidence
 * rather than a hint. A repo that imports Ollama can demonstrably run without a
 * cloud key; the keyword pass could only guess at that from prose.
 *
 * Scores 0 when detection has not run, so profiles without the field are ranked
 * exactly as they were before.
 */
function localRuntimeScore(
    clone: CloneEntry,
    weights: { present: number; locked: number; byo: number } = { present: 70, locked: -40, byo: 15 },
): number {
    const support = clone.data.model_support;
    if (!support || support.providers.length === 0) return 0;
    if (support.local_capable) return weights.present;
    if (support.provider_lock) return weights.locked;
    return support.byo_endpoint ? weights.byo : 0;
}

export function getIntentScore(filter: IntentFilter, clone: CloneEntry, openClaw?: CloneEntry): number {
    const text = getCloneText(clone);

    switch (filter) {
        case 'secure':
            return (
                clone.data.metrics.security_score * 2 +
                clone.data.radar_chart.sandboxing * 12 +
                clone.data.radar_chart.api_security * 10 +
                clone.data.radar_chart.network_isolation * 8 +
                clone.data.radar_chart.telemetry_safety * 8 -
                clone.data.radar_chart.shell_access_risk * 10 +
                keywordScore(text, ['security', 'sandbox', 'privacy', 'wasm', 'isolation'])
            );
        case 'local':
            return (
                clone.data.radar_chart.telemetry_safety * 10 +
                clone.data.radar_chart.network_isolation * 10 +
                (clone.data.local_first === true ? 60 : clone.data.local_first === false ? -60 : 0) +
                cloudDependencyScore(clone, { none: 40, optional: 15, required: -50 }) +
                localRuntimeScore(clone) +
                keywordScore(text, ['local-first', 'offline', 'on-device', 'ollama', 'data stays', 'privacy'])
            );
        case 'zero-api':
            return (
                keywordScore(text, ['zero-cost', 'zero cost', 'no api', 'free forever', 'offline', 'local models', 'deterministic']) +
                cloudDependencyScore(clone, { none: 60, optional: 20, required: -60 }) +
                localRuntimeScore(clone, { present: 80, locked: -60, byo: 10 }) +
                clone.data.radar_chart.telemetry_safety * 6 +
                clone.data.radar_chart.network_isolation * 5
            );
        case 'teams':
            // `multi_user` is the only direct evidence of shared-workflow support, so
            // it leads. Traction is capped: without a ceiling a single mega-repo
            // outscores every project that actually declares multi-user support.
            return (
                (clone.data.multi_user === true ? 120 : clone.data.multi_user === false ? -80 : 0) +
                clone.data.community_sentiment * 0.6 +
                Math.min(40, clone.data.github_stars / 1000) +
                keywordScore(text, ['team', 'multi-user', 'workspace', 'enterprise', 'discord', 'slack', 'collaborative'])
            );
        case 'edge':
            return (
                Math.max(0, 350 - clone.data.metrics.boot_time_ms) +
                Math.max(0, 220 - clone.data.metrics.memory_mb) * 2 +
                keywordScore(text, ['edge', 'embedded', 'esp32', 'single-binary', 'raspberry pi', 'microcontroller', 'lightweight'])
            );
        case 'replacement':
            return (
                clone.data.github_stars / 120 +
                clone.data.community_sentiment * 1.3 +
                clone.data.metrics.security_score +
                clone.data.radar_chart.sandboxing * 6 +
                keywordScore(text, ['alternative to openclaw', 'openclaw alternative', 'self-hosted', 'production', 'feature parity']) -
                (openClaw && clone.id === openClaw.id ? 9999 : 0)
            );
        case 'all':
        default:
            return 0;
    }
}

export function deriveBestFor(clone: CloneEntry): string {
    if (clone.data.best_for && clone.data.best_for.length > 0) {
        return clone.data.best_for[0] || 'General OpenClaw alternative';
    }

    const text = getCloneText(clone);

    if (text.includes('privacy') || text.includes('sandbox') || text.includes('security')) {
        return 'Security-sensitive self-hosting';
    }
    if (text.includes('team') || text.includes('multi-user') || text.includes('slack') || text.includes('discord')) {
        return 'Teams and shared agent workflows';
    }
    if (text.includes('edge') || text.includes('esp32') || text.includes('embedded') || clone.data.metrics.memory_mb <= 20) {
        return 'Lightweight or edge deployments';
    }
    if (text.includes('offline') || text.includes('ollama') || text.includes('local-first')) {
        return 'Local-first builders';
    }

    return 'General OpenClaw replacement';
}

export function deriveTradeoff(clone: CloneEntry): string {
    if (clone.data.avoid_if && clone.data.avoid_if.length > 0) {
        return clone.data.avoid_if[0] || 'Evidence is still evolving.';
    }

    const text = getCloneText(clone);

    if (clone.data.radar_chart.shell_access_risk >= 8) {
        return 'Tradeoff: higher shell or execution risk than hardened alternatives.';
    }
    if (clone.data.github_stars < 1000 || text.includes('early') || text.includes('experimental')) {
        return 'Tradeoff: still early, so maturity and docs may lag.';
    }
    if (clone.data.metrics.memory_mb <= 15 || text.includes('edge') || text.includes('embedded')) {
        return 'Tradeoff: efficiency often comes with narrower feature scope.';
    }
    if (text.includes('team') || text.includes('enterprise')) {
        return 'Tradeoff: more platform overhead than solo local-first tools.';
    }

    return 'Tradeoff: inspect the profile to verify setup, security, and feature depth.';
}

export function deriveOpenClawDelta(clone: CloneEntry, openClaw?: CloneEntry): string {
    if (clone.data.openclaw_advantages && clone.data.openclaw_advantages.length > 0) {
        return clone.data.openclaw_advantages[0] || 'Different emphasis than OpenClaw.';
    }

    if (!openClaw) {
        return 'OpenClaw baseline unavailable.';
    }

    if (clone.data.metrics.memory_mb < openClaw.data.metrics.memory_mb / 3) {
        return 'Leaner than OpenClaw on memory and runtime footprint.';
    }
    if (clone.data.metrics.security_score > openClaw.data.metrics.security_score + 15) {
        return 'Stronger security posture than OpenClaw by default.';
    }
    if (clone.data.community_sentiment > openClaw.data.community_sentiment + 10) {
        return 'Currently carrying stronger community momentum than OpenClaw.';
    }
    if (clone.data.github_stars > openClaw.data.github_stars * 0.15) {
        return 'More credible than a niche clone, while staying more focused than OpenClaw.';
    }

    return 'More opinionated and narrower than OpenClaw.';
}

export function deriveWhyChoose(entry: CloneEntry): string[] {
    if (entry.data.openclaw_advantages?.length) {
        return entry.data.openclaw_advantages.slice(0, 3);
    }

    const text = getCloneText(entry);
    const points: string[] = [];

    if (entry.data.metrics.security_score >= 85) {
        points.push('Safer default posture than OpenClaw for security-conscious deployments.');
    }
    if (entry.data.metrics.memory_mb <= 20 || text.includes('edge') || text.includes('embedded')) {
        points.push('Runs far leaner than OpenClaw on constrained hardware and low-cost hosts.');
    }
    if (text.includes('local-first') || text.includes('offline') || text.includes('on-device')) {
        points.push('Keeps more of the workflow local, reducing cloud dependency and data exposure.');
    }
    if (text.includes('team') || text.includes('multi-user') || text.includes('enterprise')) {
        points.push('Better fit than OpenClaw for shared workspaces, teams, or operations-heavy usage.');
    }
    if (text.includes('wasm') || text.includes('sandbox') || text.includes('isolation')) {
        points.push('Emphasizes isolation and containment where OpenClaw often prioritizes raw flexibility.');
    }

    return dedupeStrings(points).slice(0, 3);
}

export function deriveTradeoffs(entry: CloneEntry): string[] {
    if (entry.data.openclaw_disadvantages?.length) {
        return entry.data.openclaw_disadvantages.slice(0, 3);
    }

    const text = getCloneText(entry);
    const points: string[] = [];

    if (entry.data.github_stars < 2000 || text.includes('experimental') || text.includes('early')) {
        points.push('Still less proven than OpenClaw in maturity, docs depth, or production mileage.');
    }
    if (entry.data.metrics.memory_mb <= 20 || text.includes('edge') || text.includes('embedded')) {
        points.push('Efficiency usually comes with narrower scope, fewer integrations, or rougher ergonomics.');
    }
    if (text.includes('team') || text.includes('enterprise')) {
        points.push('Heavier operational setup than simpler solo or hobby-grade local agents.');
    }
    if (entry.data.radar_chart.shell_access_risk >= 7) {
        points.push('Still needs careful sandboxing and guardrails before trusted production use.');
    }

    return dedupeStrings(points).slice(0, 3);
}

export function deriveBestFit(entry: CloneEntry): string[] {
    if (entry.data.best_for?.length) {
        return entry.data.best_for.slice(0, 3);
    }

    const text = getCloneText(entry);
    const points: string[] = [];

    if (text.includes('privacy') || text.includes('security') || text.includes('sandbox')) {
        points.push('Security-sensitive self-hosters');
    }
    if (text.includes('local-first') || text.includes('offline') || text.includes('ollama')) {
        points.push('Builders who want local-first AI workflows');
    }
    if (text.includes('team') || text.includes('multi-user') || text.includes('slack') || text.includes('discord')) {
        points.push('Teams needing shared agent workflows');
    }
    if (text.includes('edge') || text.includes('embedded') || entry.data.metrics.memory_mb <= 20) {
        points.push('Edge devices and lightweight deployments');
    }

    return dedupeStrings(points).slice(0, 3);
}

export function deriveAvoidIf(entry: CloneEntry): string[] {
    if (entry.data.avoid_if?.length) {
        return entry.data.avoid_if.slice(0, 3);
    }

    const text = getCloneText(entry);
    const points: string[] = [];

    if (entry.data.github_stars < 2000 || text.includes('experimental') || text.includes('early')) {
        points.push('You only want battle-tested projects with a long public track record');
    }
    if (entry.data.metrics.memory_mb <= 20 || text.includes('edge') || text.includes('embedded')) {
        points.push('You care more about broad integrations than minimal footprint');
    }
    if (text.includes('team') || text.includes('enterprise')) {
        points.push('You just need a personal assistant, not a team workflow layer');
    }
    if (entry.data.radar_chart.shell_access_risk >= 7) {
        points.push('You cannot tolerate elevated execution risk without extra hardening');
    }

    return dedupeStrings(points).slice(0, 3);
}

function getPrivacyUseCaseScore(clone: CloneEntry): number {
    const text = getCloneText(clone);
    let score =
        clone.data.metrics.security_score * 1.5 +
        clone.data.radar_chart.sandboxing * 10 +
        clone.data.radar_chart.network_isolation * 12 +
        clone.data.radar_chart.telemetry_safety * 14 -
        clone.data.radar_chart.shell_access_risk * 7 +
        keywordScore(text, [
            'privacy',
            'local-first',
            'offline',
            'on-device',
            'sandbox',
            'container',
            'isolation',
            'encrypted',
            'vault',
            'self-hosted',
        ]);

    if (clone.data.privacy_posture === 'strong') score += 30;
    if (clone.data.privacy_posture === 'mixed') score += 8;
    if (clone.data.local_first === true) score += 20;
    if (clone.data.cloud_dependency === 'none') score += 18;
    if (clone.data.cloud_dependency === 'optional') score += 8;
    if (clone.data.cloud_dependency === 'required') score -= 20;

    return score;
}

export function getUseCaseLandingPage(slug: string): UseCaseLandingPage | undefined {
    return useCaseLandingPages.find((page) => page.slug === slug);
}

export function getUseCaseLandingShortlist(
    slug: string,
    clones: CloneEntry[],
    shortlistSize = 6,
): CloneEntry[] {
    const alternatives = clones.filter((clone) => clone.id !== 'openclaw' && clone.data.health_status !== 'abandoned');

    switch (slug) {
        case 'privacy':
            return alternatives
                .map((clone) => ({
                    clone,
                    score: getPrivacyUseCaseScore(clone),
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, shortlistSize)
                .map((entry) => entry.clone);
        default:
            return [];
    }
}
