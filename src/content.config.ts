import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const cloudDependencySchema = z.enum(['required', 'optional', 'none', 'unknown']);
const setupDifficultySchema = z.enum(['low', 'medium', 'high', 'unknown']);
const privacyPostureSchema = z.enum(['strong', 'mixed', 'weak', 'unknown']);
const pluginEcosystemSchema = z.enum(['strong', 'emerging', 'limited', 'unknown']);
const operationalRiskSchema = z.enum(['low', 'medium', 'high', 'unknown']);
const refreshModeSchema = z.enum(['refresh', 'review', 'rewrite']);

const providerSignalSchema = z.object({
    kind: z.enum(['dependency', 'endpoint', 'env_key', 'adapter_file', 'prose']),
    value: z.string(),
    path: z.string(),
    strength: z.enum(['strong', 'weak']),
});

const defaultModelSchema = z.object({
    model: z.string(),
    provider: z.string().nullable(),
    path: z.string(),
    line: z.string(),
    strength: z.enum(['strong', 'weak']),
});

/**
 * Detector output, not model-written. `providers` being empty means detection
 * found nothing, which is not the same as the project supporting nothing.
 */
const modelSupportSchema = z.object({
    providers: z.array(z.string()),
    provider_count: z.number().int().nonnegative(),
    local_capable: z.boolean(),
    aggregator_capable: z.boolean(),
    byo_endpoint: z.boolean(),
    provider_lock: z.string().nullable(),
    default_model: defaultModelSchema.nullable(),
    default_models: z.array(defaultModelSchema).default([]),
    default_model_ambiguous: z.boolean().default(false),
    evidence: z.array(providerSignalSchema).default([]),
    default_model_last_touched: z.string().nullable().default(null),
    default_model_released_at: z.string().nullable().default(null),
    default_model_date_source: z.enum(['model_id', 'catalogue']).nullable().default(null),
    files_examined: z.number().int().nonnegative(),
    detected_at: z.string(),
    detection_version: z.string(),
});

const contentOpsSchema = z.object({
    last_generated_at: z.string(),
    last_reviewed_at: z.string(),
    refresh_mode: refreshModeSchema,
    source_window: z.string(),
    change_reason: z.string(),
    generation_version: z.string(),
}).partial();

const cloneSchema = z.object({
    id: z.string(),
    name: z.string(),
    language: z.string(),
    vibe_summary: z.string(),
    health_status: z.enum(['healthy', 'warning', 'abandoned']),
    github_stars: z.number(),
    metrics: z.object({
        boot_time_ms: z.number(),
        memory_mb: z.number(),
        security_score: z.number(),
    }),
    radar_chart: z.object({
        sandboxing: z.number().min(1).max(10),
        api_security: z.number().min(1).max(10),
        network_isolation: z.number().min(1).max(10),
        telemetry_safety: z.number().min(1).max(10),
        shell_access_risk: z.number().min(1).max(10),
    }),
    tags: z.array(z.string()),
    community_sentiment: z.number().min(0).max(100).default(50),
    reddit_mentions: z.number().default(0),
    web_mentions: z.number().default(0),
    best_for: z.array(z.string()).optional(),
    avoid_if: z.array(z.string()).optional(),
    deployment_target: z.array(z.string()).optional(),
    local_first: z.boolean().nullable().optional(),
    cloud_dependency: cloudDependencySchema.optional(),
    setup_difficulty: setupDifficultySchema.optional(),
    privacy_posture: privacyPostureSchema.optional(),
    multi_user: z.boolean().nullable().optional(),
    plugin_ecosystem: pluginEcosystemSchema.optional(),
    license_type: z.string().nullable().optional(),
    last_commit_at: z.string().nullable().optional(),
    contributors_count: z.number().int().nonnegative().nullable().optional(),
    open_issues_count: z.number().int().nonnegative().nullable().optional(),
    release_cadence_days: z.number().int().nonnegative().nullable().optional(),
    operational_risk: operationalRiskSchema.optional(),
    model_support: modelSupportSchema.nullable().optional(),
    openclaw_advantages: z.array(z.string()).optional(),
    openclaw_disadvantages: z.array(z.string()).optional(),
    confidence_summary: z.string().optional(),
    evidence_confidence: z.number().min(0).max(100).optional(),
    content_ops: contentOpsSchema.optional(),
    overview_markdown: z.string().optional(),
    latest_release: z.object({
        version: z.string(),
        date: z.string(),
        url: z.string(),
    }).nullable().optional(),
    last_updated: z.string(),
});

const clones = defineCollection({
    loader: glob({ pattern: "*.json", base: "./src/content/clones" }),
    schema: cloneSchema
});

const watchlist = defineCollection({
    loader: glob({ pattern: "*.json", base: "./src/content/watchlist" }),
    schema: cloneSchema.extend({
        watchlist_added: z.string(), // ISO date when added to watchlist
        // Promotion eligibility, recomputed each run. `promoted` is gone: a
        // promoted project moves to the clones collection and its watchlist
        // file is deleted, so membership lives only in `projects.json`.
        promotion_status: z.enum(['observing', 'candidate']).default('observing'),
    })
});

export const collections = {
    clones,
    watchlist
};
