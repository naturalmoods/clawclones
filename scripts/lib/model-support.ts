/**
 * Detects which LLM providers a tracked project can talk to, and which model it
 * defaults to. Everything here is evidence-based: a provider is only reported
 * when a concrete file backs it, and the backing file is kept alongside the
 * result so a profile page can link to it.
 *
 * This module never calls the network. It reads through a RepoFileSource, so the
 * same rules run against the GitHub API in the pipeline and against a local
 * clone in smoke tests.
 */

export const DETECTION_VERSION = '1';

export type ProviderId =
    | 'anthropic'
    | 'openai'
    | 'google'
    | 'azure-openai'
    | 'bedrock'
    | 'vertex'
    | 'openrouter'
    | 'litellm'
    | 'ollama'
    | 'llamacpp'
    | 'lmstudio'
    | 'vllm'
    | 'deepseek'
    | 'moonshot'
    | 'zhipu'
    | 'qwen'
    | 'minimax'
    | 'groq'
    | 'mistral'
    | 'xai'
    | 'together'
    | 'fireworks'
    | 'cohere'
    | 'openai-compatible';

export type SignalKind = 'dependency' | 'endpoint' | 'env_key' | 'adapter_file' | 'prose';

export type SignalStrength = 'strong' | 'weak';

export interface ProviderSignal {
    kind: SignalKind;
    /** The literal token that matched, so a human can grep for it. */
    value: string;
    /** Repo-relative path of the file the token was found in. */
    path: string;
    strength: SignalStrength;
}

export interface ProviderFinding {
    provider: ProviderId;
    signals: ProviderSignal[];
    strength: SignalStrength;
}

export interface DefaultModelFinding {
    /** The model identifier as written in the repo, not normalized. */
    model: string;
    provider: ProviderId | null;
    path: string;
    /** The line the value was read from, trimmed and length-capped. */
    line: string;
    strength: SignalStrength;
}

export interface ModelSupport {
    providers: ProviderId[];
    provider_count: number;
    /** Can run against a model on the user's own machine. */
    local_capable: boolean;
    /** Reaches many providers through one gateway (OpenRouter, LiteLLM). */
    aggregator_capable: boolean;
    /** Accepts an arbitrary OpenAI-compatible base URL. */
    byo_endpoint: boolean;
    /** Set only when exactly one first-party provider is reachable and there is no escape hatch. */
    provider_lock: ProviderId | null;
    /** Best-supported default, or null when nothing is pinned in the repo. */
    default_model: DefaultModelFinding | null;
    /** Every pinned default found. Projects with one default per provider have several. */
    default_models: DefaultModelFinding[];
    /** True when more than one default is pinned with equal confidence. */
    default_model_ambiguous: boolean;
    findings: ProviderFinding[];
    files_examined: number;
    detected_at: string;
    detection_version: string;
}

/** The trimmed shape written into a clone's content JSON. */
export interface PublishedModelSupport {
    providers: ProviderId[];
    provider_count: number;
    local_capable: boolean;
    aggregator_capable: boolean;
    byo_endpoint: boolean;
    provider_lock: ProviderId | null;
    default_model: DefaultModelFinding | null;
    default_models: DefaultModelFinding[];
    default_model_ambiguous: boolean;
    /** One or two backing files per provider, so a reader can check the claim. */
    evidence: ProviderSignal[];
    /**
     * ISO date of the last commit touching the file that pins the default model.
     * A project whose pin has not been edited in a year is running whatever was
     * current when it was written. Null when the lookup was unavailable.
     */
    default_model_last_touched: string | null;
    files_examined: number;
    detected_at: string;
    detection_version: string;
}

const EVIDENCE_PER_PROVIDER = 2;

/**
 * Drops the full signal set down to what a profile page needs. Keeping every
 * signal would roughly double the size of a clone's JSON for no reader benefit.
 */
export function publishModelSupport(
    support: ModelSupport,
    lastTouched?: string | null,
): PublishedModelSupport {
    const evidence = support.findings
        .filter(finding => finding.strength === 'strong')
        .flatMap(finding =>
            [...finding.signals]
                .sort((a, b) => signalWeight(b) - signalWeight(a))
                .slice(0, EVIDENCE_PER_PROVIDER),
        );

    return {
        providers: support.providers,
        provider_count: support.provider_count,
        local_capable: support.local_capable,
        aggregator_capable: support.aggregator_capable,
        byo_endpoint: support.byo_endpoint,
        provider_lock: support.provider_lock,
        default_model: support.default_model,
        default_models: support.default_models,
        default_model_ambiguous: support.default_model_ambiguous,
        evidence,
        default_model_last_touched: lastTouched ?? null,
        files_examined: support.files_examined,
        detected_at: support.detected_at,
        detection_version: support.detection_version,
    };
}

const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
    dependency: 4,
    adapter_file: 3,
    env_key: 2,
    endpoint: 1,
    prose: 0,
};

function signalWeight(signal: ProviderSignal): number {
    return (signal.strength === 'strong' ? 10 : 0) + SIGNAL_WEIGHTS[signal.kind];
}

export interface RepoFileSource {
    /** Every repo-relative file path, in any order. */
    listFiles(): Promise<string[]>;
    /** File contents as UTF-8, or null when unreadable, binary or too large. */
    readFile(path: string): Promise<string | null>;
}

interface ProviderRule {
    provider: ProviderId;
    /** Package names, matched exactly against manifest dependency keys and loosely in manifest text. */
    dependencies?: string[];
    /** Hostnames or path fragments of the provider's API. */
    endpoints?: string[];
    /** Environment variable names. */
    envKeys?: string[];
    /** Basename stems that mark a provider adapter, e.g. `anthropic` in `src/providers/anthropic.ts`. */
    adapterStems?: string[];
}

const PROVIDER_RULES: ProviderRule[] = [
    {
        provider: 'anthropic',
        dependencies: [
            '@anthropic-ai/sdk',
            '@anthropic-ai/claude-agent-sdk',
            '@anthropic-ai/bedrock-sdk',
            '@ai-sdk/anthropic',
            'anthropic',
            'anthropic-sdk-go',
            'anthropic-ai',
            'async-anthropic',
            'clust',
        ],
        endpoints: ['api.anthropic.com'],
        envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'CLAUDE_API_KEY'],
        adapterStems: ['anthropic', 'claude'],
    },
    {
        provider: 'openai',
        dependencies: ['openai', '@ai-sdk/openai', 'go-openai', 'async-openai', 'openai-api-rs', 'tiktoken'],
        endpoints: ['api.openai.com'],
        envKeys: ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_API_BASE', 'OPENAI_MODEL'],
        adapterStems: ['openai'],
    },
    {
        provider: 'google',
        dependencies: [
            '@google/genai',
            '@google/generative-ai',
            '@ai-sdk/google',
            'google-generativeai',
            'google-genai',
            'genai',
        ],
        endpoints: ['generativelanguage.googleapis.com'],
        envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_MODEL'],
        adapterStems: ['gemini', 'google'],
    },
    {
        provider: 'azure-openai',
        dependencies: ['@azure/openai', '@ai-sdk/azure', 'azure-ai-inference'],
        endpoints: ['openai.azure.com', 'cognitiveservices.azure.com'],
        envKeys: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT'],
        adapterStems: ['azure'],
    },
    {
        provider: 'bedrock',
        dependencies: ['@aws-sdk/client-bedrock-runtime', '@ai-sdk/amazon-bedrock', 'aws-sdk-bedrockruntime'],
        endpoints: ['bedrock-runtime'],
        envKeys: ['AWS_BEARER_TOKEN_BEDROCK', 'BEDROCK_MODEL_ID', 'CLAUDE_CODE_USE_BEDROCK'],
        adapterStems: ['bedrock'],
    },
    {
        provider: 'vertex',
        dependencies: ['@google-cloud/vertexai', '@ai-sdk/google-vertex', 'google-cloud-aiplatform'],
        endpoints: ['aiplatform.googleapis.com'],
        envKeys: ['GOOGLE_VERTEX_PROJECT', 'VERTEX_PROJECT_ID', 'CLAUDE_CODE_USE_VERTEX'],
        adapterStems: ['vertex'],
    },
    {
        provider: 'openrouter',
        dependencies: ['@openrouter/ai-sdk-provider', 'openrouter-client', 'openrouter'],
        endpoints: ['openrouter.ai/api'],
        envKeys: ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENROUTER_BASE_URL'],
        adapterStems: ['openrouter'],
    },
    {
        provider: 'litellm',
        dependencies: ['litellm'],
        endpoints: ['litellm'],
        envKeys: ['LITELLM_API_KEY', 'LITELLM_BASE_URL', 'LITELLM_MODEL'],
        adapterStems: ['litellm'],
    },
    {
        provider: 'ollama',
        dependencies: ['ollama', 'ollama-js', 'ollama-rs', 'ollama-python', '@ai-sdk/ollama', 'ollama-ai-provider'],
        endpoints: ['11434', 'ollama.com/api'],
        envKeys: ['OLLAMA_HOST', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'OLLAMA_API_BASE'],
        adapterStems: ['ollama'],
    },
    {
        provider: 'llamacpp',
        dependencies: ['node-llama-cpp', 'llama-cpp-python', 'llama_cpp', 'llama-cpp-2'],
        endpoints: ['8080/completion'],
        envKeys: ['LLAMA_CPP_SERVER', 'LLAMACPP_BASE_URL'],
        adapterStems: ['llamacpp', 'llama-cpp', 'llama_cpp'],
    },
    {
        provider: 'lmstudio',
        dependencies: ['@lmstudio/sdk', 'lmstudio'],
        endpoints: ['1234/v1'],
        envKeys: ['LMSTUDIO_BASE_URL', 'LM_STUDIO_BASE_URL'],
        adapterStems: ['lmstudio', 'lm-studio'],
    },
    {
        provider: 'vllm',
        dependencies: ['vllm'],
        endpoints: ['8000/v1'],
        envKeys: ['VLLM_BASE_URL', 'VLLM_API_BASE'],
        adapterStems: ['vllm'],
    },
    {
        provider: 'deepseek',
        dependencies: ['@ai-sdk/deepseek'],
        endpoints: ['api.deepseek.com'],
        envKeys: ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'],
        adapterStems: ['deepseek'],
    },
    {
        provider: 'moonshot',
        endpoints: ['api.moonshot.cn', 'api.moonshot.ai'],
        envKeys: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
        adapterStems: ['moonshot', 'kimi'],
    },
    {
        provider: 'zhipu',
        endpoints: ['open.bigmodel.cn', 'api.z.ai'],
        envKeys: ['ZHIPU_API_KEY', 'ZHIPUAI_API_KEY', 'GLM_API_KEY'],
        adapterStems: ['zhipu', 'bigmodel'],
    },
    {
        provider: 'qwen',
        dependencies: ['dashscope'],
        endpoints: ['dashscope.aliyuncs.com'],
        envKeys: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
        adapterStems: ['dashscope', 'qwen'],
    },
    {
        provider: 'minimax',
        endpoints: ['api.minimax.chat', 'api.minimaxi.com'],
        envKeys: ['MINIMAX_API_KEY', 'MINIMAX_GROUP_ID'],
        adapterStems: ['minimax'],
    },
    {
        provider: 'groq',
        dependencies: ['groq-sdk', '@ai-sdk/groq', 'groq'],
        endpoints: ['api.groq.com'],
        envKeys: ['GROQ_API_KEY', 'GROQ_MODEL'],
        adapterStems: ['groq'],
    },
    {
        provider: 'mistral',
        dependencies: ['@mistralai/mistralai', '@ai-sdk/mistral', 'mistralai'],
        endpoints: ['api.mistral.ai'],
        envKeys: ['MISTRAL_API_KEY', 'MISTRAL_MODEL'],
        adapterStems: ['mistral'],
    },
    {
        provider: 'xai',
        dependencies: ['@ai-sdk/xai'],
        endpoints: ['api.x.ai'],
        envKeys: ['XAI_API_KEY', 'GROK_API_KEY'],
        adapterStems: ['xai', 'grok'],
    },
    {
        provider: 'together',
        dependencies: ['together-ai', '@ai-sdk/togetherai', 'together'],
        endpoints: ['api.together.xyz', 'api.together.ai'],
        envKeys: ['TOGETHER_API_KEY'],
        adapterStems: ['together'],
    },
    {
        provider: 'fireworks',
        dependencies: ['@ai-sdk/fireworks', 'fireworks-ai'],
        endpoints: ['api.fireworks.ai'],
        envKeys: ['FIREWORKS_API_KEY'],
        adapterStems: ['fireworks'],
    },
    {
        provider: 'cohere',
        dependencies: ['cohere-ai', '@ai-sdk/cohere', 'cohere'],
        endpoints: ['api.cohere.com', 'api.cohere.ai'],
        envKeys: ['COHERE_API_KEY'],
        adapterStems: ['cohere'],
    },
];

const LOCAL_PROVIDERS: ProviderId[] = ['ollama', 'llamacpp', 'lmstudio', 'vllm'];
const AGGREGATOR_PROVIDERS: ProviderId[] = ['openrouter', 'litellm'];
/** Not a vendor: reaching these says nothing about which model actually answers. */
const NON_VENDOR_PROVIDERS: ProviderId[] = [...LOCAL_PROVIDERS, ...AGGREGATOR_PROVIDERS, 'openai-compatible'];

const MANIFEST_FILES = [
    'package.json',
    'requirements.txt',
    'requirements-dev.txt',
    'pyproject.toml',
    'setup.py',
    'go.mod',
    'cargo.toml',
    'composer.json',
    'gemfile',
    'pubspec.yaml',
    'build.gradle',
    'build.gradle.kts',
    'pom.xml',
    'deno.json',
    'deno.jsonc',
];

const ENV_EXAMPLE_PATTERN = /(^|\/)\.?env[.-]?(example|sample|template|dist)?$|(^|\/)\.env\.(example|sample|template|local\.example)$/i;
const CONFIG_EXAMPLE_PATTERN = /(^|\/)[^/]*(config|settings|models?|providers?)[^/]*\.(example|sample|template|default)\.(ya?ml|toml|json|jsonc|ini)$|(^|\/)(config|settings)\.(example|sample|template)\.[a-z]+$/i;
const SOURCE_EXTENSION_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|cs|php|zig|c|cc|cpp|h|hpp|sh|lua|ex|exs|dart|scala|hs|nim|jl)$/i;
const ADAPTER_DIR_PATTERN = /(^|\/)(providers?|llms?|models?|adapters?|backends?|clients?|integrations?|agents?|inference|ai)(\/|$)/i;
const CONFIG_FILE_PATTERN = /(^|\/)(config|settings|defaults?|constants?|models?|providers?)[^/]*\.[a-z]+$/i;

/**
 * File name stems that carry provider wiring regardless of directory. C and Go
 * projects tend to keep `llm.c` or `client.go` at the top of a source folder
 * rather than under a `providers/` directory, and the first version of this
 * detector missed them entirely.
 */
const ADAPTER_FILE_STEMS = new Set([
    'llm',
    'llms',
    'model',
    'models',
    'provider',
    'providers',
    'client',
    'clients',
    'inference',
    'completion',
    'completions',
    'chat',
    'agent',
    'ai',
    'config',
    'constants',
    'defaults',
    'settings',
    'kconfig',
]);

/** Paths whose model mentions describe history or documentation, not what the code runs. */
const NON_AUTHORITATIVE_PATH_PATTERN =
    /(^|\/)(changelog|history|releases?|news|docs?|documentation|website|site|blog|examples?|samples?|benchmarks?|evals?|tests?|__tests__|spec|fixtures?|testdata|vendor|node_modules|third_party|\.github)(\/|$)|(^|\/)(changelog|history|contributing|code_of_conduct|security|readme)[^/]*\.(md|mdx|rst|txt)$|[.\-_](test|tests|spec|mock|mocks|fixture)\.[a-z]+$|(^|\/)(test|tests|spec|mock|conftest)_[^/]*$/i;

const MAX_FILE_BYTES = 400_000;
const MAX_SOURCE_FILES = 90;
const MAX_LINE_LENGTH = 200;
/** Below this many source hits the targeted patterns clearly missed, so cast wider. */
const FALLBACK_THRESHOLD = 10;
const FALLBACK_MAX_DEPTH = 3;
const FALLBACK_LIMIT = 50;
/**
 * A file naming this many providers is a catalogue or a router table, not proof
 * that each one is wired up. Its signals are kept but demoted.
 */
const CATALOGUE_PROVIDER_COUNT = 5;
const MAX_DEFAULT_MODELS = 6;

function basename(path: string): string {
    const index = path.lastIndexOf('/');
    return index === -1 ? path : path.slice(index + 1);
}

function stem(path: string): string {
    const name = basename(path).toLowerCase();
    const dot = name.indexOf('.');
    return dot === -1 ? name : name.slice(0, dot);
}

function isManifest(path: string): boolean {
    const name = basename(path).toLowerCase();
    if (MANIFEST_FILES.includes(name)) return true;
    return /^requirements.*\.txt$/.test(name) || /\.csproj$/.test(name);
}

function isEnvExample(path: string): boolean {
    const name = basename(path);
    if (/^\.env($|\.)/i.test(name)) return true;
    return ENV_EXAMPLE_PATTERN.test(name);
}

function isRootReadme(path: string): boolean {
    return /^readme(\.(md|mdx|rst|txt))?$/i.test(path);
}

/**
 * Picks the files worth reading. Ordering matters: manifests and env examples are
 * the highest-signal-per-byte files in any repo, so they are read first and the
 * source-file budget is spent on what is left.
 */
export function selectFilesToRead(paths: string[]): string[] {
    const manifests: string[] = [];
    const configs: string[] = [];
    const adapters: string[] = [];
    const readme: string[] = [];
    const remainingSource: string[] = [];

    for (const path of paths) {
        if (path.includes('node_modules/') || path.includes('vendor/')) continue;

        if (isManifest(path) || isEnvExample(path) || CONFIG_EXAMPLE_PATTERN.test(path)) {
            manifests.push(path);
            continue;
        }
        if (isRootReadme(path)) {
            readme.push(path);
            continue;
        }
        if (!SOURCE_EXTENSION_PATTERN.test(path)) continue;
        if (NON_AUTHORITATIVE_PATH_PATTERN.test(path)) continue;

        if (CONFIG_FILE_PATTERN.test(path)) {
            configs.push(path);
            continue;
        }
        if (
            ADAPTER_DIR_PATTERN.test(path) ||
            ADAPTER_FILE_STEMS.has(stem(path)) ||
            PROVIDER_RULES.some(rule => rule.adapterStems?.includes(stem(path)))
        ) {
            adapters.push(path);
            continue;
        }
        remainingSource.push(path);
    }

    const shallowest = (list: string[]) =>
        list.sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);

    const targeted = [
        ...manifests,
        ...readme,
        ...shallowest(configs).slice(0, MAX_SOURCE_FILES / 2),
        ...shallowest(adapters).slice(0, MAX_SOURCE_FILES / 2),
    ];

    if (configs.length + adapters.length >= FALLBACK_THRESHOLD) return targeted;

    const fallback = shallowest(remainingSource)
        .filter(path => path.split('/').length <= FALLBACK_MAX_DEPTH)
        .slice(0, FALLBACK_LIMIT);

    return [...targeted, ...fallback];
}

function pushSignal(
    map: Map<ProviderId, ProviderSignal[]>,
    provider: ProviderId,
    signal: ProviderSignal,
): void {
    const existing = map.get(provider);
    if (!existing) {
        map.set(provider, [signal]);
        return;
    }
    const duplicate = existing.some(
        item => item.kind === signal.kind && item.value === signal.value && item.path === signal.path,
    );
    if (!duplicate) existing.push(signal);
}

function collectSignals(path: string, content: string): Map<ProviderId, ProviderSignal[]> {
    const map = new Map<ProviderId, ProviderSignal[]>();
    const lower = content.toLowerCase();
    const manifest = isManifest(path);
    const envExample = isEnvExample(path);
    const prose = /\.(md|mdx|rst|txt)$/i.test(path);
    const fileStem = stem(path);

    for (const rule of PROVIDER_RULES) {
        if (rule.adapterStems?.includes(fileStem) && SOURCE_EXTENSION_PATTERN.test(path)) {
            pushSignal(map, rule.provider, {
                kind: 'adapter_file',
                value: basename(path),
                path,
                strength: 'strong',
            });
        }

        for (const dependency of rule.dependencies ?? []) {
            if (!manifest) continue;
            // Match the dependency as a delimited token so `openai` does not fire on
            // `openai-compatible-shim` and `together` does not fire on prose.
            const pattern = new RegExp(`(^|[\\s"'\`(\\[/=:,])${escapeRegExp(dependency)}([\\s"'\`)\\]=:,;<>~^@]|$)`, 'm');
            if (pattern.test(lower)) {
                pushSignal(map, rule.provider, { kind: 'dependency', value: dependency, path, strength: 'strong' });
            }
        }

        for (const endpoint of rule.endpoints ?? []) {
            if (lower.includes(endpoint.toLowerCase())) {
                pushSignal(map, rule.provider, {
                    kind: 'endpoint',
                    value: endpoint,
                    path,
                    strength: prose ? 'weak' : 'strong',
                });
            }
        }

        for (const envKey of rule.envKeys ?? []) {
            if (content.includes(envKey)) {
                pushSignal(map, rule.provider, {
                    kind: 'env_key',
                    value: envKey,
                    path,
                    strength: prose && !envExample ? 'weak' : 'strong',
                });
            }
        }
    }

    // A bare /v1/chat/completions call is just OpenAI. What makes an endpoint
    // "bring your own" is the base URL being configurable, or the project saying so.
    const compatiblePhrase = /openai[\s_-]?compatible/i.test(content);
    const configurableBase = /\b(OPENAI_BASE_URL|OPENAI_API_BASE|LLM_BASE_URL|API_BASE_URL|BASE_URL)\b\s*[:=?]/i.test(content);
    if (compatiblePhrase || configurableBase) {
        pushSignal(map, 'openai-compatible', {
            kind: compatiblePhrase ? 'prose' : 'env_key',
            value: compatiblePhrase ? 'openai-compatible' : 'configurable base URL',
            path,
            strength: prose && !envExample ? 'weak' : 'strong',
        });
    }

    return map;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MODEL_ID_PATTERN =
    /\b((?:claude|gpt|chatgpt|o[1-9]|gemini|gemma|deepseek|qwen|qwq|llama|codellama|mistral|mixtral|magistral|devstral|codestral|glm|kimi|moonshot|minimax|step|grok|command|phi|yi|ernie|doubao|nova|sonar|hermes|nemotron|granite|olmo|smol)[-._][a-z0-9][a-z0-9._-]{1,40})\b/i;

/**
 * The key half of a `key = "model-id"` assignment. Kept separate from the
 * separator so C-style `#define X_MODEL "id"` lines, which have no `=`, are
 * still read.
 */
const MODEL_KEY_PATTERN =
    /(?:^|[^a-z0-9_])([a-z0-9_]*default[_-]?model[a-z0-9_]*|[a-z0-9_]*model[_-]?(?:id|name|default)|[a-z][a-z0-9]*_model[a-z0-9_]*|model)(?![a-z0-9])/i;

const MODEL_PROVIDER_HINTS: Array<{ pattern: RegExp; provider: ProviderId }> = [
    { pattern: /^claude/i, provider: 'anthropic' },
    { pattern: /^(gpt|chatgpt|o[1-9])/i, provider: 'openai' },
    { pattern: /^(gemini|gemma)/i, provider: 'google' },
    { pattern: /^deepseek/i, provider: 'deepseek' },
    { pattern: /^(qwen|qwq)/i, provider: 'qwen' },
    { pattern: /^(kimi|moonshot)/i, provider: 'moonshot' },
    { pattern: /^glm/i, provider: 'zhipu' },
    { pattern: /^minimax/i, provider: 'minimax' },
    { pattern: /^grok/i, provider: 'xai' },
    { pattern: /^(mistral|mixtral|magistral|devstral|codestral)/i, provider: 'mistral' },
    { pattern: /^command/i, provider: 'cohere' },
];

function inferModelProvider(model: string): ProviderId | null {
    const bare = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model;
    for (const hint of MODEL_PROVIDER_HINTS) {
        if (hint.pattern.test(bare)) return hint.provider;
    }
    return null;
}

/**
 * Finds the model the project ships as its default. Only lines that assign a
 * model-shaped value to a model-shaped key count, which keeps the "supported
 * models" tables in READMEs from being mistaken for a default.
 */
function findDefaultModels(path: string, content: string): DefaultModelFinding[] {
    const prose = /\.(md|mdx|rst|txt)$/i.test(path);
    const envExample = isEnvExample(path);
    const found: DefaultModelFinding[] = [];

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.length > 400) continue;

        const key = line.match(MODEL_KEY_PATTERN);
        if (!key || key.index === undefined) continue;

        // Only the value half, so a key like `anthropic_model` is never read as an id.
        const after = line.slice(key.index + key[0].length);
        if (!/^\s*(?:[:=]|["'`])/.test(after)) continue;

        const value = after.replace(/^\s*[:=]+/, '');
        // Prefer the quoted literal: without this, `const QWEN_37_MODEL_ID = ...`
        // reads its own constant name as the model.
        const quoted = value.match(/["'`]([^"'`\n]{2,80})["'`]/);
        const match = (quoted ? quoted[1] : value).match(MODEL_ID_PATTERN);
        if (!match) continue;

        const model = match[1].replace(/[.,;"'`)\]}]+$/, '');
        // SCREAMING_SNAKE_CASE with no dash is an identifier, not a model id.
        if (/^[A-Z0-9_]+$/.test(model)) continue;
        // A bare family name is a category, not a pinned default.
        if (!/[0-9]/.test(model) && !/-(sonnet|opus|haiku|flash|pro|mini|nano|turbo|latest|max|plus|air|coder|reasoner|chat)\b/i.test(model)) {
            continue;
        }

        // A shipped example config is a statement of intent in the same way an
        // .env.example is, even when the line itself never says "default".
        const explicitDefault = /default/i.test(line) || envExample || CONFIG_EXAMPLE_PATTERN.test(path);
        found.push({
            model,
            provider: inferModelProvider(model),
            path,
            line: line.slice(0, MAX_LINE_LENGTH),
            strength: prose || !explicitDefault ? 'weak' : 'strong',
        });
    }

    return found;
}

function rankDefault(finding: DefaultModelFinding): number {
    let score = finding.strength === 'strong' ? 100 : 0;
    if (isEnvExample(finding.path)) score += 40;
    if (CONFIG_EXAMPLE_PATTERN.test(finding.path)) score += 30;
    if (/(^|\/)(defaults?|constants?|config)[^/]*\.[a-z]+$/i.test(finding.path)) score += 25;
    // Plugin and integration folders pin their own model; that is not the project's default.
    if (/(^|\/)(plugins?|extensions?|contrib)(\/|$)/i.test(finding.path)) score -= 35;
    if (/\.(md|mdx|rst|txt)$/i.test(finding.path)) score -= 30;
    if (/default/i.test(finding.line)) score += 20;
    score -= finding.path.split('/').length;
    return score;
}

export async function detectModelSupport(source: RepoFileSource, now = new Date()): Promise<ModelSupport> {
    const paths = await source.listFiles();
    const selected = selectFilesToRead(paths);

    const signalMap = new Map<ProviderId, ProviderSignal[]>();
    const defaults: DefaultModelFinding[] = [];
    let filesExamined = 0;

    for (const path of selected) {
        let content: string | null = null;
        try {
            content = await source.readFile(path);
        } catch (error) {
            console.warn(`  ! unreadable ${path}: ${(error as Error).message}`);
            continue;
        }
        if (!content || content.length > MAX_FILE_BYTES) continue;

        filesExamined += 1;

        const fileSignals = collectSignals(path, content);
        // Manifests and env examples list what the project actually wires up, so a
        // long list there is real. Anywhere else, a long list is a catalogue.
        const authoritativeList = isManifest(path) || isEnvExample(path);
        const catalogue = !authoritativeList && fileSignals.size >= CATALOGUE_PROVIDER_COUNT;

        for (const [provider, signals] of fileSignals) {
            for (const signal of signals) {
                pushSignal(signalMap, provider, catalogue ? { ...signal, strength: 'weak' } : signal);
            }
        }

        if (!NON_AUTHORITATIVE_PATH_PATTERN.test(path)) {
            defaults.push(...findDefaultModels(path, content));
        }
    }

    const findings: ProviderFinding[] = [...signalMap.entries()]
        .map(([provider, signals]) => ({
            provider,
            signals,
            strength: signals.some(signal => signal.strength === 'strong') ? ('strong' as const) : ('weak' as const),
        }))
        .sort((a, b) => a.provider.localeCompare(b.provider));

    const confirmed = findings.filter(finding => finding.strength === 'strong').map(finding => finding.provider);
    const localCapable = confirmed.some(provider => LOCAL_PROVIDERS.includes(provider));
    const aggregatorCapable = confirmed.some(provider => AGGREGATOR_PROVIDERS.includes(provider));
    const byoEndpoint = confirmed.includes('openai-compatible');

    const vendors = confirmed.filter(provider => !NON_VENDOR_PROVIDERS.includes(provider));
    const providerLock =
        vendors.length === 1 && !localCapable && !aggregatorCapable && !byoEndpoint ? vendors[0] : null;

    defaults.sort((a, b) => rankDefault(b) - rankDefault(a));

    const byModel = new Map<string, DefaultModelFinding>();
    for (const finding of defaults) {
        const key = finding.model.toLowerCase();
        if (!byModel.has(key)) byModel.set(key, finding);
    }
    const uniqueDefaults = [...byModel.values()].slice(0, MAX_DEFAULT_MODELS);
    const strongDefaults = uniqueDefaults.filter(finding => finding.strength === 'strong');

    return {
        providers: confirmed,
        provider_count: vendors.length,
        local_capable: localCapable,
        aggregator_capable: aggregatorCapable,
        byo_endpoint: byoEndpoint,
        provider_lock: providerLock,
        default_model: uniqueDefaults[0] ?? null,
        default_models: uniqueDefaults,
        default_model_ambiguous: strongDefaults.length > 1,
        findings,
        files_examined: filesExamined,
        detected_at: now.toISOString(),
        detection_version: DETECTION_VERSION,
    };
}
