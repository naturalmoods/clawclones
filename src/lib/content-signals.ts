type RefreshMode = 'refresh' | 'review' | 'rewrite';

interface ContentOpsMetadata {
    last_generated_at?: string;
    last_reviewed_at?: string;
    refresh_mode?: RefreshMode;
    source_window?: string;
}

interface SignalRecord {
    last_updated?: string;
    evidence_confidence?: number;
    content_ops?: ContentOpsMetadata;
}

type FreshnessState = {
    label: string;
    detail: string;
    tone: string;
    stale: boolean;
};

/**
 * Pill tones. Every entry carries an explicit light and dark value: the previous
 * set was authored for a dark-only theme and rendered near-invisible on paper.
 */
const TONES = {
    neutral: 'text-pale-slate-500 border-pale-slate-500/30 bg-pale-slate-500/[0.08]',
    accent: 'text-accent dark:text-accent-soft border-accent/30 dark:border-accent-soft/30 bg-accent/[0.06] dark:bg-accent-soft/10',
    positive: 'text-emerald-700 dark:text-emerald-400 border-emerald-700/30 dark:border-emerald-400/30 bg-emerald-700/[0.06] dark:bg-emerald-400/10',
    caution: 'text-amber-700 dark:text-amber-400 border-amber-700/30 dark:border-amber-400/30 bg-amber-700/[0.06] dark:bg-amber-400/10',
    warning: 'text-red-700 dark:text-red-400 border-red-700/30 dark:border-red-400/30 bg-red-700/[0.06] dark:bg-red-400/10',
} as const;

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const freshnessThresholds: Record<RefreshMode, { fresh: number; aging: number }> = {
    refresh: { fresh: 3, aging: 7 },
    review: { fresh: 7, aging: 14 },
    rewrite: { fresh: 14, aging: 30 },
};

function parseDate(value?: string): Date | null {
    if (!value) return null;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatSignalDate(value?: string): string {
    const parsed = parseDate(value);
    if (!parsed) return 'Unknown';

    return parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/** Whole days between a timestamp and now, or null when the value is unusable. */
export function getAgeInDays(value?: string, now: Date = new Date()): number | null {
    const parsed = parseDate(value);
    if (!parsed) return null;

    return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / DAY_IN_MS));
}

/**
 * Relative age for trust copy. A promised cadence means little without the
 * measured distance from it, so pages state both.
 */
export function formatAge(value?: string, now: Date = new Date()): string {
    const days = getAgeInDays(value, now);
    if (days === null) return 'unknown';
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
}

export function getConfidenceLabel(score?: number): string {
    if (typeof score !== 'number') return 'Limited Evidence';
    if (score >= 80) return 'High Confidence';
    if (score >= 55) return 'Good Confidence';
    if (score >= 35) return 'Mixed Evidence';
    return 'Low Confidence';
}

export function getConfidenceTone(score?: number): string {
    if (typeof score !== 'number') return TONES.neutral;
    if (score >= 80) return TONES.positive;
    if (score >= 55) return TONES.accent;
    if (score >= 35) return TONES.caution;
    return TONES.warning;
}

export function getConfidenceDetail(score?: number): string {
    if (typeof score !== 'number') {
        return 'Read this as a directional AI brief until stronger evidence lands.';
    }
    if (score >= 80) {
        return 'Backed by multiple direct signals plus supporting context.';
    }
    if (score >= 55) {
        return 'Useful guidance with a reasonable evidence base behind it.';
    }
    if (score >= 35) {
        return 'Helpful, but still inference-heavy enough to double-check primary sources.';
    }
    return 'Use this as a lead, not as a production-grade verdict.';
}

export function getRefreshModeLabel(mode?: RefreshMode): string {
    switch (mode) {
        case 'refresh':
            return 'Quick Refresh';
        case 'review':
            return 'AI Review';
        case 'rewrite':
            return 'Full Rewrite';
        default:
            return 'Review State Unknown';
    }
}

export function getRefreshModeTone(mode?: RefreshMode): string {
    switch (mode) {
        case 'refresh':
            return TONES.neutral;
        case 'review':
            return TONES.accent;
        case 'rewrite':
            return TONES.accent;
        default:
            return TONES.neutral;
    }
}

export function getSignalDates(record: SignalRecord): {
    lastGeneratedAt?: string;
    lastReviewedAt?: string;
} {
    return {
        lastGeneratedAt: record.content_ops?.last_generated_at,
        lastReviewedAt: record.content_ops?.last_reviewed_at || record.last_updated,
    };
}

export function getFreshnessState(record: SignalRecord): FreshnessState {
    const mode = record.content_ops?.refresh_mode || 'review';
    const thresholds = freshnessThresholds[mode];
    const { lastReviewedAt } = getSignalDates(record);
    const reviewedDate = parseDate(lastReviewedAt);

    if (!reviewedDate) {
        return {
            label: 'Review Date Unknown',
            detail: 'Freshness metadata is incomplete for this AI-written layer.',
            tone: TONES.neutral,
            stale: true,
        };
    }

    const ageInDays = Math.max(0, Math.floor((Date.now() - reviewedDate.getTime()) / DAY_IN_MS));

    if (ageInDays <= thresholds.fresh) {
        return {
            label: 'Freshly Reviewed',
            detail: `AI decision layer last reviewed ${formatSignalDate(lastReviewedAt)}.`,
            tone: TONES.positive,
            stale: false,
        };
    }

    if (ageInDays <= thresholds.aging) {
        return {
            label: 'Review Soon',
            detail: `AI decision layer last reviewed ${formatSignalDate(lastReviewedAt)}.`,
            tone: TONES.caution,
            stale: false,
        };
    }

    return {
        label: 'Needs Refresh',
        detail: `AI decision layer last reviewed ${formatSignalDate(lastReviewedAt)}.`,
        tone: TONES.warning,
        stale: true,
    };
}
