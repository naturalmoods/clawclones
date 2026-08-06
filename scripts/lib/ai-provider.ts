import {
    AI_PROVIDER,
    OPENROUTER_MODEL,
    NVIDIA_MODEL,
    NVIDIA_BASE_URL,
} from './config';
import type {
    CloneData,
    CloudDependency,
    ContentOpsMetadata,
    OperationalRisk,
    PluginEcosystem,
    PrivacyPosture,
    RefreshMode,
    SetupDifficulty,
} from './types';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

export const AI_GENERATION_VERSION = 'clawclones-v2-decision-support';
export const DEFAULT_SOURCE_WINDOW =
    'GitHub metadata, README, recent commits, latest release, Reddit, Brave search';

function clampConfidence(value: unknown, fallback: number): number {
    const numeric = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(numeric)) return fallback;

    return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
    if (!Array.isArray(value)) return fallback;

    return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
}

function normalizeEnum<T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: T,
): T {
    return typeof value === 'string' && allowed.includes(value as T)
        ? (value as T)
        : fallback;
}

function normalizeNullableBoolean(
    value: unknown,
    fallback: boolean | null = null,
): boolean | null {
    if (typeof value === 'boolean') return value;

    return fallback;
}

interface NormalizeCloneDataOptions {
    repo: string;
    existingData?: Partial<CloneData> | null;
    refreshMode: RefreshMode;
    changeReason: string;
    sourceWindow?: string;
    measured?: {
        github_stars?: number;
        reddit_mentions?: number;
        web_mentions?: number;
        latest_release?: CloneData['latest_release'] | null;
        language?: string | null;
        license_type?: string | null;
        last_commit_at?: string | null;
        contributors_count?: number | null;
        open_issues_count?: number | null;
        release_cadence_days?: number | null;
        model_support?: CloneData['model_support'];
        last_updated?: string;
    };
}

export function buildContentOpsMetadata(
    existingData: Partial<CloneData> | null | undefined,
    options: {
        refreshMode: RefreshMode;
        changeReason: string;
        sourceWindow?: string;
        now?: string;
    },
): ContentOpsMetadata {
    const now = options.now || new Date().toISOString();
    const existing = existingData?.content_ops || {};

    return {
        last_generated_at:
            options.refreshMode === 'rewrite'
                ? now
                : existing.last_generated_at || now,
        last_reviewed_at: now,
        refresh_mode: options.refreshMode,
        source_window:
            options.sourceWindow || existing.source_window || DEFAULT_SOURCE_WINDOW,
        change_reason: options.changeReason,
        generation_version: AI_GENERATION_VERSION,
    };
}

export function normalizeCloneData(
    rawData: Partial<CloneData> | null | undefined,
    options: NormalizeCloneDataOptions,
): CloneData {
    const existingData = options.existingData || null;
    const merged = {
        ...(existingData || {}),
        ...(rawData || {}),
    } as Partial<CloneData>;
    const measured = options.measured || {};
    const fallbackConfidence = existingData?.evidence_confidence ?? 35;

    return {
        id: options.repo,
        name:
            merged.name ||
            existingData?.name ||
            options.repo.split('/').pop() ||
            options.repo,
        language:
            measured.language || merged.language || existingData?.language || 'Unknown',
        vibe_summary:
            merged.vibe_summary ||
            existingData?.vibe_summary ||
            'Profile pending AI rewrite.',
        health_status: normalizeEnum(
            merged.health_status,
            ['healthy', 'warning', 'abandoned'] as const,
            'warning',
        ),
        github_stars:
            measured.github_stars ??
            merged.github_stars ??
            existingData?.github_stars ??
            0,
        metrics: {
            boot_time_ms:
                merged.metrics?.boot_time_ms ??
                existingData?.metrics?.boot_time_ms ??
                0,
            memory_mb:
                merged.metrics?.memory_mb ?? existingData?.metrics?.memory_mb ?? 0,
            security_score:
                merged.metrics?.security_score ??
                existingData?.metrics?.security_score ??
                0,
        },
        radar_chart: {
            sandboxing:
                merged.radar_chart?.sandboxing ??
                existingData?.radar_chart?.sandboxing ??
                5,
            api_security:
                merged.radar_chart?.api_security ??
                existingData?.radar_chart?.api_security ??
                5,
            network_isolation:
                merged.radar_chart?.network_isolation ??
                existingData?.radar_chart?.network_isolation ??
                5,
            telemetry_safety:
                merged.radar_chart?.telemetry_safety ??
                existingData?.radar_chart?.telemetry_safety ??
                5,
            shell_access_risk:
                merged.radar_chart?.shell_access_risk ??
                existingData?.radar_chart?.shell_access_risk ??
                5,
        },
        tags: normalizeStringArray(merged.tags, existingData?.tags || []),
        community_sentiment:
            merged.community_sentiment ?? existingData?.community_sentiment ?? 50,
        reddit_mentions:
            measured.reddit_mentions ??
            merged.reddit_mentions ??
            existingData?.reddit_mentions ??
            0,
        web_mentions:
            measured.web_mentions ??
            merged.web_mentions ??
            existingData?.web_mentions ??
            0,
        best_for: normalizeStringArray(merged.best_for, existingData?.best_for || []),
        avoid_if: normalizeStringArray(merged.avoid_if, existingData?.avoid_if || []),
        deployment_target: normalizeStringArray(
            merged.deployment_target,
            existingData?.deployment_target || [],
        ),
        local_first: normalizeNullableBoolean(
            merged.local_first,
            existingData?.local_first ?? null,
        ),
        cloud_dependency: normalizeEnum<CloudDependency>(
            merged.cloud_dependency,
            ['required', 'optional', 'none', 'unknown'] as const,
            existingData?.cloud_dependency || 'unknown',
        ),
        setup_difficulty: normalizeEnum<SetupDifficulty>(
            merged.setup_difficulty,
            ['low', 'medium', 'high', 'unknown'] as const,
            existingData?.setup_difficulty || 'unknown',
        ),
        privacy_posture: normalizeEnum<PrivacyPosture>(
            merged.privacy_posture,
            ['strong', 'mixed', 'weak', 'unknown'] as const,
            existingData?.privacy_posture || 'unknown',
        ),
        multi_user: normalizeNullableBoolean(
            merged.multi_user,
            existingData?.multi_user ?? null,
        ),
        plugin_ecosystem: normalizeEnum<PluginEcosystem>(
            merged.plugin_ecosystem,
            ['strong', 'emerging', 'limited', 'unknown'] as const,
            existingData?.plugin_ecosystem || 'unknown',
        ),
        license_type:
            measured.license_type === undefined
                ? merged.license_type ?? existingData?.license_type ?? null
                : measured.license_type,
        last_commit_at:
            measured.last_commit_at === undefined
                ? merged.last_commit_at ?? existingData?.last_commit_at ?? null
                : measured.last_commit_at,
        contributors_count:
            measured.contributors_count === undefined
                ? merged.contributors_count ?? existingData?.contributors_count ?? null
                : measured.contributors_count,
        open_issues_count:
            measured.open_issues_count === undefined
                ? merged.open_issues_count ?? existingData?.open_issues_count ?? null
                : measured.open_issues_count,
        release_cadence_days:
            measured.release_cadence_days === undefined
                ? merged.release_cadence_days ?? existingData?.release_cadence_days ?? null
                : measured.release_cadence_days,
        operational_risk: normalizeEnum<OperationalRisk>(
            merged.operational_risk,
            ['low', 'medium', 'high', 'unknown'] as const,
            existingData?.operational_risk || 'unknown',
        ),
        // Detector output only. A model is never allowed to author this field, so
        // `merged` — which carries the AI response — is deliberately not consulted.
        model_support:
            measured.model_support === undefined
                ? existingData?.model_support ?? null
                : measured.model_support,
        openclaw_advantages: normalizeStringArray(
            merged.openclaw_advantages,
            existingData?.openclaw_advantages || [],
        ),
        openclaw_disadvantages: normalizeStringArray(
            merged.openclaw_disadvantages,
            existingData?.openclaw_disadvantages || [],
        ),
        confidence_summary:
            merged.confidence_summary ||
            existingData?.confidence_summary ||
            'Limited evidence available. Use the primary sources before making a production decision.',
        evidence_confidence: clampConfidence(
            merged.evidence_confidence,
            fallbackConfidence,
        ),
        content_ops: buildContentOpsMetadata(existingData, {
            refreshMode: options.refreshMode,
            changeReason: options.changeReason,
            sourceWindow: options.sourceWindow,
            now: measured.last_updated,
        }),
        overview_markdown:
            merged.overview_markdown || existingData?.overview_markdown || '',
        latest_release:
            measured.latest_release === undefined
                ? merged.latest_release ?? existingData?.latest_release
                : measured.latest_release || undefined,
        last_updated:
            measured.last_updated ||
            merged.last_updated ||
            existingData?.last_updated ||
            new Date().toISOString(),
    };
}

export async function generateAIJSON(repo: string, githubData: any) {
    const provider = AI_PROVIDER;
    const apiKey = provider === 'nvidia' ? NVIDIA_API_KEY : OPENROUTER_API_KEY;

    if (!apiKey) {
        console.warn(`Missing API key for ${provider}. Skipping AI analysis for ${repo}.`);
        return null;
    }

    const model = provider === 'nvidia' ? NVIDIA_MODEL : OPENROUTER_MODEL;
    const baseUrl =
        provider === 'nvidia' ? NVIDIA_BASE_URL : 'https://openrouter.ai/api/v1';

    console.log(`Analyzing ${repo} with ${provider} (${model})...`);

    const systemPrompt = `
You are an expert AI system analyzing open-source GitHub repositories.
Your task is to analyze the provided repository data, README, and recent commits to generate a structured JSON output that conforms EXACTLY to the following TypeScript interface:
{
  is_valid_clone: boolean; // MUST be true if the repo is an AI agent model/framework, clone, or alternative related to OpenClaw. MUST be false if it's unrelated, spam, or a generic non-AI project.
  id: string; // The full repo name, e.g., "${repo}"
  name: string; // The short human-readable name of the project
  language: string; // The primary programming language
  vibe_summary: string; // A punchy, 2-sentence summary of what makes this clone unique or its current vibe.
  health_status: 'healthy' | 'warning' | 'abandoned'; // Determine based on commit activity and repo status.
  github_stars: number; // Use the provided exact star count.
  metrics: {
    boot_time_ms: number; // Estimate based on the language/framework.
    // IMPORTANT: Projects with "pico", "nano", "micro" or "zero" in their name
    // MUST BE ESTIMATED AS HIGHLY OPTIMIZED (boot < 10ms, memory < 2MB).
    // Standard Rust/Go: boot 20-50ms, memory 10-20MB.
    // Standard Node/Python/TS: boot 100-300ms, memory 50-100MB.
    memory_mb: number;
    security_score: number; // 0-100 score based on security practices mentioned in readme
  };
  radar_chart: {
    sandboxing: number; // 1-10
    api_security: number; // 1-10
    network_isolation: number; // 1-10
    telemetry_safety: number; // 1-10
    shell_access_risk: number; // 0-10 (10 means very high risk / unrestricted shell, 1 means isolated / no unsupervised shell)
  };
  tags: string[]; // 3-5 relevant lowercase tags
  community_sentiment: number; // 0-100 score based on Reddit AND Brave Web search feedback provided
  reddit_mentions: number; // Use the provided match count
  web_mentions?: number; // Representing general search footprint volume
  best_for: string[]; // 2-4 short bullets describing the best-fit users or use cases
  avoid_if: string[]; // 2-4 short bullets describing who should avoid this project
  deployment_target: string[]; // Examples: ['edge', 'desktop', 'cloud', 'self-hosted']
  local_first: boolean | null; // true, false, or null if uncertain
  cloud_dependency: 'required' | 'optional' | 'none' | 'unknown';
  setup_difficulty: 'low' | 'medium' | 'high' | 'unknown';
  privacy_posture: 'strong' | 'mixed' | 'weak' | 'unknown';
  multi_user: boolean | null;
  plugin_ecosystem: 'strong' | 'emerging' | 'limited' | 'unknown';
  license_type: string | null; // exact license if known, else null
  operational_risk: 'low' | 'medium' | 'high' | 'unknown';
  openclaw_advantages: string[]; // 2-5 concise points where this project may beat OpenClaw
  openclaw_disadvantages: string[]; // 2-5 concise points where OpenClaw is stronger or this project is weaker
  confidence_summary: string; // 1-2 sentences explaining evidence strength and uncertainty
  evidence_confidence: number; // 0-100 confidence in your recommendation fields
  content_ops: {
    last_generated_at: string; // ISO timestamp
    last_reviewed_at: string; // ISO timestamp
    refresh_mode: 'refresh' | 'review' | 'rewrite'; // Use 'rewrite' for this full synthesis
    source_window: string; // Summary of the evidence used
    change_reason: string; // Example: 'Scheduled AI re-analysis'
    generation_version: string; // Use '${AI_GENERATION_VERSION}'
  };
  overview_markdown: string; // A detailed 2-3 paragraph markdown-formatted overview of the project, its core architecture, unique features, and how it differs from OpenClaw. Synthesize from the README and recent commit data.
  latest_release?: {
    version: string;
    date: string; // ISO date
    url: string;
  };
  last_updated: string; // ISO date string of the last commit or now
}

Rules for the decision-support fields:
- Use short, concrete phrases instead of hypey copy.
- If a value is uncertain, prefer explicit unknown states over invented precision.
- best_for, avoid_if, openclaw_advantages, and openclaw_disadvantages should be concise and decision-oriented.
- confidence_summary must mention uncertainty when evidence is thin or mixed.
- content_ops.refresh_mode should be 'rewrite'.
- content_ops.source_window should refer to the actual sources present in the prompt.

Return ONLY valid, raw JSON. Do not include markdown formatting like \`\`\`json.
`;

    const userPrompt = `
Repository: ${repo}
Stars: ${githubData.repoInfo.stargazers_count}
Language: ${githubData.repoInfo.language}
License: ${githubData.repoInfo.license?.spdx_id || 'Unknown'}
Description: ${githubData.repoInfo.description || 'No description provided.'}

README Excerpt:
${githubData.readme}

Recent Commits:
${githubData.recentCommits}

Latest Release Info:
${githubData.latestRelease ? `Version: ${githubData.latestRelease.version}\nDate: ${githubData.latestRelease.date}\nURL: ${githubData.latestRelease.url}` : 'No official release found.'}

Reddit Discussions/Search Results:
(Matches: ${githubData.reddit.matches})
${githubData.reddit.posts.map((p: any) => `Title: ${p.title}\nURL: ${p.url}`).join('\n---\n')}

Brave Web Search Sentiment (Snippets):
(Matches: ${githubData.brave?.matches || 0})
${(githubData.brave?.snippets || []).map((s: any) => `Title: ${s.title}\nDesc: ${s.description}`).join('\n---\n')}
`;

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            // Reasoning models spend a while before the first token: the
            // previous two-minute ceiling aborted deepseek-v4-pro mid-answer.
            // Override with AI_REQUEST_TIMEOUT_MS when a model needs more.
            signal: AbortSignal.timeout(
                Number(process.env.AI_REQUEST_TIMEOUT_MS) || 300_000,
            ),
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.1,
            }),
        });

        if (!response.ok) {
            console.error(
                `${provider} API error for ${repo}: ${response.status} ${response.statusText}`,
                await response.text(),
            );
            return null;
        }

        const data: any = await response.json();

        if (!data.choices || data.choices.length === 0) {
            console.error(
                `${provider} API Error for ${repo}:`,
                JSON.stringify(data, null, 2),
            );
            return null;
        }

        let content = data.choices[0].message.content.trim();

        if (content.startsWith('```')) {
            content = content
                .replace(/^```(?:json)?\s+/, '')
                .replace(/\s+```$/, '');
        }

        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            content = content.substring(firstBrace, lastBrace + 1);
        }

        try {
            return JSON.parse(content);
        } catch (_parseError) {
            console.warn(
                `Initial parse failed for ${repo} (${provider}), attempting recovery...`,
            );

            const structuralFix = content.replace(
                /(?<![:{,\[\s])\n(?![}\],])/g,
                '\\n',
            );

            try {
                return JSON.parse(structuralFix);
            } catch (_e2) {
                console.error(`Final parse failed for ${repo} (${provider}).`);
                return null;
            }
        }
    } catch (error) {
        console.error(`Error generating AI JSON for ${repo} with ${provider}:`, error);
        return null;
    }
}
