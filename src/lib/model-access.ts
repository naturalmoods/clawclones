/**
 * Presentation helpers for the detected provider and model data.
 *
 * The detector reports what it found in a repository; nothing here adds
 * judgement to that. There is deliberately no score: a project reaching ten
 * providers is not "better" than one that pins a single model well, and a
 * weighted number would only invite arguments about the weights.
 */
import type { CollectionEntry } from 'astro:content';

type ModelSupport = NonNullable<CollectionEntry<'clones'>['data']['model_support']>;
type ProviderSignal = ModelSupport['evidence'][number];
type DefaultModel = NonNullable<ModelSupport['default_model']>;

export type ProviderKind = 'vendor' | 'gateway' | 'local' | 'compatibility';

interface ProviderMeta {
    label: string;
    kind: ProviderKind;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
    anthropic: { label: 'Anthropic', kind: 'vendor' },
    openai: { label: 'OpenAI', kind: 'vendor' },
    google: { label: 'Google', kind: 'vendor' },
    'azure-openai': { label: 'Azure OpenAI', kind: 'vendor' },
    bedrock: { label: 'AWS Bedrock', kind: 'vendor' },
    vertex: { label: 'Vertex AI', kind: 'vendor' },
    deepseek: { label: 'DeepSeek', kind: 'vendor' },
    moonshot: { label: 'Moonshot', kind: 'vendor' },
    zhipu: { label: 'Zhipu', kind: 'vendor' },
    qwen: { label: 'Qwen', kind: 'vendor' },
    minimax: { label: 'MiniMax', kind: 'vendor' },
    groq: { label: 'Groq', kind: 'vendor' },
    mistral: { label: 'Mistral', kind: 'vendor' },
    xai: { label: 'xAI', kind: 'vendor' },
    together: { label: 'Together', kind: 'vendor' },
    fireworks: { label: 'Fireworks', kind: 'vendor' },
    cohere: { label: 'Cohere', kind: 'vendor' },
    openrouter: { label: 'OpenRouter', kind: 'gateway' },
    litellm: { label: 'LiteLLM', kind: 'gateway' },
    ollama: { label: 'Ollama', kind: 'local' },
    llamacpp: { label: 'llama.cpp', kind: 'local' },
    lmstudio: { label: 'LM Studio', kind: 'local' },
    vllm: { label: 'vLLM', kind: 'local' },
    'openai-compatible': { label: 'OpenAI-compatible', kind: 'compatibility' },
};

const SIGNAL_LABELS: Record<ProviderSignal['kind'], string> = {
    dependency: 'client library',
    adapter_file: 'adapter',
    env_key: 'env var',
    endpoint: 'endpoint',
    prose: 'documented',
};

const KIND_ORDER: ProviderKind[] = ['vendor', 'gateway', 'local', 'compatibility'];

export function providerLabel(provider: string): string {
    return PROVIDER_META[provider]?.label ?? provider;
}

export function providerKind(provider: string): ProviderKind {
    return PROVIDER_META[provider]?.kind ?? 'vendor';
}

export function signalLabel(kind: ProviderSignal['kind']): string {
    return SIGNAL_LABELS[kind] ?? kind;
}

/** Providers grouped by what they are, so the list reads as four short rows. */
export function groupProviders(support: ModelSupport): Array<{ kind: ProviderKind; title: string; providers: string[] }> {
    const titles: Record<ProviderKind, string> = {
        vendor: 'Direct',
        gateway: 'Gateway',
        local: 'Local',
        compatibility: 'Compatible',
    };

    return KIND_ORDER.map(kind => ({
        kind,
        title: titles[kind],
        providers: support.providers.filter(provider => providerKind(provider) === kind).sort(),
    })).filter(group => group.providers.length > 0);
}

/** A one-line answer to "what can I point this at?", or null when nothing was found. */
export function accessSummary(support: ModelSupport): string | null {
    if (support.providers.length === 0) return null;

    const parts: string[] = [];
    parts.push(support.provider_count === 1 ? '1 provider' : `${support.provider_count} providers`);
    if (support.local_capable) parts.push('runs locally');
    if (support.aggregator_capable) parts.push('gateway support');
    else if (support.byo_endpoint) parts.push('custom endpoint');

    return parts.join(' · ');
}

/** Links a piece of evidence to the exact file it came from. */
export function sourceUrl(repoId: string, path: string): string {
    return `https://github.com/${repoId}/blob/HEAD/${path}`;
}

/**
 * Detected model ids carry their release date in the name often enough to be
 * useful, and a project pinned to a two-year-old snapshot is a maintenance
 * signal worth surfacing. Returns null when the id says nothing about age.
 */
export function modelDateHint(model: string): string | null {
    const iso = model.match(/(20\d{2})[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])/);
    if (!iso) return null;

    return `${iso[1]}-${iso[2]}-${iso[3]}`;
}

const DAY_IN_MS = 1000 * 60 * 60 * 24;
/**
 * Where a pinned model stops looking current. A frontier generation currently
 * runs four to six months, so six months is roughly one generation behind and
 * twelve is two or more. Stated in generations rather than fitted to the current
 * field, which is small and moves quickly.
 */
const AGING_DAYS = 180;
const STALE_DAYS = 365;

export type AgeTone = 'neutral' | 'aging' | 'stale';

export interface Age {
    /** Human phrasing of the interval, e.g. "17 months". */
    label: string;
    days: number;
    tone: AgeTone;
}

function measureAge(from: string | null | undefined, now: Date): Age | null {
    if (!from) return null;

    const start = new Date(from);
    if (Number.isNaN(start.getTime())) return null;

    const days = Math.max(0, Math.round((now.getTime() - start.getTime()) / DAY_IN_MS));
    const months = Math.round(days / 30);
    const label =
        days < 45 ? `${days} days` : months < 24 ? `${months} months` : `${Math.floor(days / 365)} years`;

    return {
        label,
        days,
        tone: days >= STALE_DAYS ? 'stale' : days >= AGING_DAYS ? 'aging' : 'neutral',
    };
}

/**
 * How old the pinned model itself is.
 *
 * This is the honest staleness signal. The file-edit date below answers a
 * different and weaker question — several projects here edit the file that holds
 * their pin without ever changing the model, so by that measure they look
 * current while running a model two years old.
 */
export function modelAge(support: ModelSupport, now: Date = new Date()): Age | null {
    return measureAge(support.default_model_released_at, now);
}

/**
 * How long the project's model pin has sat untouched.
 *
 * Secondary to `modelAge`: a fact about the repository rather than about the
 * model. Read together the two are more informative than either alone — a
 * recently edited file holding an old model means the pin is a choice, not
 * neglect.
 */
export function pinAge(support: ModelSupport, now: Date = new Date()): Age | null {
    return measureAge(support.default_model_last_touched, now);
}

/** Where the release date came from, for the reader who wants to check it. */
export function dateSourceLabel(support: ModelSupport): string | null {
    if (support.default_model_date_source === 'model_id') return 'dated in the model id';
    if (support.default_model_date_source === 'catalogue') return 'from the public model catalogue';
    return null;
}

export function defaultModelLabel(support: ModelSupport): string {
    if (!support.default_model) return 'not pinned';
    if (support.default_model_ambiguous) return `${support.default_model.model} (varies by provider)`;
    return support.default_model.model;
}

export type { ModelSupport, DefaultModel, ProviderSignal };
