/**
 * Dates a model id.
 *
 * The point of this module is to answer "how old is the model this project
 * pins?" without a hand-maintained table. Two sources, both checkable:
 *
 *   1. The id itself. `claude-3-5-sonnet-20241022` carries its release date,
 *      and a dated snapshot id is the strongest evidence available.
 *   2. OpenRouter's public model catalogue, whose `created` field records when
 *      each model became available there. That is a proxy for the release date,
 *      usually within a day or two of it, and it is measured rather than
 *      authored.
 *
 * What this cannot do: date a model the catalogue has dropped. Providers retire
 * old models, so the very oldest pins are the ones most likely to come back
 * unknown. The bias therefore runs toward under-reporting staleness, never
 * toward inventing it.
 */

const CATALOGUE_URL = 'https://openrouter.ai/api/v1/models';
const REQUEST_TIMEOUT_MS = 30_000;

export type ModelDateSource = 'model_id' | 'catalogue';

export interface ModelDate {
    /** ISO date, no time: the catalogue's precision does not justify more. */
    released_at: string;
    source: ModelDateSource;
}

const DATE_IN_ID = /(20\d{2})[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])(?![0-9])/;

/**
 * Reduces an id to a comparable form. Every rule here restores an identity —
 * two spellings of the same model — rather than guessing at a near match, so a
 * pin is never dated from a different model.
 */
export function normalizeModelId(modelId: string): string {
    let id = modelId.toLowerCase().split(':')[0];
    id = id.slice(id.lastIndexOf('/') + 1);

    // A dated snapshot is the same model as its undated id.
    id = id.replace(DATE_IN_ID, '');
    // `claude-sonnet-4-5` and `claude-sonnet-4.5` are the same version. The
    // lookahead keeps parameter counts intact: `llama-3.3-70b` must not become
    // `llama-3.3.70b`.
    id = id.replace(/(?<=\d)-(?=\d{1,2}(?![0-9]*[bm]))/g, '.');
    id = id.replace(/-(00\d|latest|preview|exp)$/, '');
    // Hosting and packaging variants of one model, not separate releases.
    id = id.replace(/-(turbo|versatile|instruct|chat|it|hf)$/, '');
    id = id.replace(/-(fp8|fp16|bf16|q\d[_a-z0-9]*|\d+k)$/, '');

    return id.replace(/^[-.\s]+|[-.\s]+$/g, '');
}

/** Reads the release date out of the id, when it carries one. */
export function dateFromModelId(modelId: string): string | null {
    const match = modelId.match(DATE_IN_ID);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export type ModelCatalogue = Map<string, string>;

/**
 * Fetches the catalogue once. Returns an empty map on any failure, which makes
 * every lookup miss and leaves the field null — the pipeline degrades to what
 * it did before rather than failing the run.
 */
export async function fetchModelCatalogue(): Promise<ModelCatalogue> {
    const catalogue: ModelCatalogue = new Map();

    try {
        const response = await fetch(CATALOGUE_URL, {
            headers: { 'User-Agent': 'ClawClones-Aggregator' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
            console.warn(`  ! model catalogue fetch failed: ${response.status}`);
            return catalogue;
        }

        const payload: any = await response.json();
        const entries = Array.isArray(payload?.data) ? payload.data : [];

        for (const entry of entries) {
            const created = typeof entry?.created === 'number' ? entry.created : null;
            if (!created) continue;

            const date = new Date(created * 1000).toISOString().slice(0, 10);
            // A model reachable through several routes keeps its earliest date.
            for (const key of [entry.id, entry.canonical_slug]) {
                if (typeof key !== 'string') continue;
                const normalized = normalizeModelId(key);
                if (!normalized) continue;
                const existing = catalogue.get(normalized);
                if (!existing || date < existing) catalogue.set(normalized, date);
            }
        }

        console.log(`Model catalogue: ${catalogue.size} distinct model ids dated.`);
    } catch (error) {
        console.warn(`  ! model catalogue unavailable: ${(error as Error).message}`);
    }

    return catalogue;
}

/** Dates one model id, preferring the id's own date over the catalogue. */
export function resolveModelDate(modelId: string, catalogue: ModelCatalogue): ModelDate | null {
    const fromId = dateFromModelId(modelId);
    if (fromId) return { released_at: fromId, source: 'model_id' };

    const dated = catalogue.get(normalizeModelId(modelId));
    return dated ? { released_at: dated, source: 'catalogue' } : null;
}
