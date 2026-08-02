/**
 * Promotion rules for the radar list.
 *
 * Shared on purpose: the watchlist pipeline enforces these thresholds and the
 * radar table prints them, and until now the table's caption spelled the
 * numbers out by hand. One definition means the rule a reader sees is the rule
 * that actually runs.
 */

export const PROMOTION_THRESHOLDS = {
    minStars: 500,
    minSentiment: 60,
    /** Time on the radar, so a brief spike cannot walk straight into the index. */
    minAgeDays: 14,
};

export interface PromotionCriterion {
    met: boolean;
    value: number;
    required: number;
}

export interface PromotionCriteria {
    stars: PromotionCriterion;
    sentiment: PromotionCriterion;
    age: PromotionCriterion;
}

export function daysSince(date: string | null | undefined, now: Date = new Date()): number {
    if (!date) return 0;
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return 0;
    return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000);
}

export function evaluatePromotion(
    input: { stars: number; sentiment: number; since: string | null | undefined },
    now: Date = new Date(),
): { eligible: boolean; criteria: PromotionCriteria } {
    const age = daysSince(input.since, now);
    const criteria: PromotionCriteria = {
        stars: {
            met: input.stars >= PROMOTION_THRESHOLDS.minStars,
            value: input.stars,
            required: PROMOTION_THRESHOLDS.minStars,
        },
        sentiment: {
            met: input.sentiment >= PROMOTION_THRESHOLDS.minSentiment,
            value: input.sentiment,
            required: PROMOTION_THRESHOLDS.minSentiment,
        },
        age: {
            met: age >= PROMOTION_THRESHOLDS.minAgeDays,
            value: age,
            required: PROMOTION_THRESHOLDS.minAgeDays,
        },
    };

    return {
        eligible: criteria.stars.met && criteria.sentiment.met && criteria.age.met,
        criteria,
    };
}

/**
 * What the entry is still waiting for, phrased for the table. Naming the gap
 * per row is what makes the list read as a queue rather than as a reject pile.
 */
export function describePromotionGap(criteria: PromotionCriteria): string {
    const missing: string[] = [];
    if (!criteria.stars.met) {
        missing.push(`${(criteria.stars.required - criteria.stars.value).toLocaleString('en-US')} more stars`);
    }
    if (!criteria.sentiment.met) missing.push(`${criteria.sentiment.required}% pulse`);
    if (!criteria.age.met) {
        const left = criteria.age.required - criteria.age.value;
        missing.push(`${left} more day${left === 1 ? '' : 's'}`);
    }

    if (missing.length === 0) return 'promoting next run';
    if (missing.length === 1) return `needs ${missing[0]}`;
    return `needs ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
}

/** Log-shaped version of the same gap, for the pipeline output. */
export function promotionGapReasons(criteria: PromotionCriteria): string[] {
    const reasons: string[] = [];
    if (!criteria.stars.met) reasons.push(`Stars: ${criteria.stars.value} < ${criteria.stars.required}`);
    if (!criteria.sentiment.met) {
        reasons.push(`Sentiment: ${criteria.sentiment.value} < ${criteria.sentiment.required}`);
    }
    if (!criteria.age.met) reasons.push(`Age: ${criteria.age.value}d < ${criteria.age.required}d`);
    return reasons;
}
