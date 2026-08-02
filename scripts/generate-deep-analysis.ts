/**
 * Weekly narrative pass for `/analysis`.
 *
 * The page computes every figure it shows from the tracked collection, so this
 * script no longer writes the report — it only writes the connective copy that
 * sits beside the computed tables. The previous version shipped 170 KB of raw
 * clone JSON to the model and asked it to author the whole page in markdown;
 * it dropped ten projects out of its own tables and contradicted the profiles
 * on 22 of 32 metric rows.
 *
 * Copy is rejected rather than published when it quotes a figure the report
 * cannot back, and a failed run leaves the computed page fully renderable.
 */
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import { OUTPUT_DIR, DATA_DIR, HISTORY_FILE } from './lib/config';
import {
    buildAnalysisReport,
    buildNarrativeDigest,
    collectAllowedNumbers,
    findUnbackedNumbers,
    toAnalysisFacts,
    type AnalysisReport,
    type StarHistory,
} from '../src/lib/analysis';

const NARRATIVE_FILE = path.join(DATA_DIR, 'analysis-narrative.json');
const METADATA_FILE = path.join(DATA_DIR, 'analysis-metadata.json');

const SECTION_KEYS = ['movement', 'architecture', 'security', 'posture'] as const;

const MAX_BULLET_CHARS = 190;
/**
 * A hard ceiling rather than the target. The prompt asks for roughly 450
 * characters; the first real run came back at 704 and 688 and lost two good
 * paragraphs to a limit that was measuring style, not correctness.
 */
const MAX_SECTION_CHARS = 820;
/** Render what survived rather than nothing: five bullets, three is enough. */
const WANTED_BULLETS = 5;
const MIN_BULLETS = 3;
/**
 * The number guard can only bound which figures appear, not who they are
 * attributed to, so the copy is also held to a few figures per passage: the
 * tables are the place for the full numbers. A paragraph comparing two cohorts
 * legitimately needs more of them than a one-line bullet.
 */
const MAX_FIGURES_BULLET = 3;
/**
 * Generous for a paragraph, because every digit in it is already checked
 * against the digest and per-project attribution is refused separately. A
 * cohort comparison legitimately cites a dozen figures; capping at six was
 * discarding correct copy.
 */
const MAX_FIGURES_SECTION = 14;

interface Narrative {
    generated_at: string;
    data_as_of: string;
    model: string;
    tldr: string[];
    sections: Record<string, string>;
}

const SYSTEM_PROMPT = `You write the short editorial layer of a weekly data report about the OpenClaw ecosystem, for developers choosing between OpenClaw alternatives.

You are given a digest of figures that were computed from the tracked dataset. The report page renders all tables and numbers itself. Your job is only the connective copy.

Hard rules:
- Never state a number that is not present in the digest. Prefer describing direction and consequence over restating figures.
- Digits read better than words in a data report — "14 projects", not "fourteen projects" — but either is checked against the digest, so accuracy matters more than style here.
- No predictions, no forecasts, no "we expect / the trajectory is / the future of". Describe what the data shows and what it means for a reader choosing a tool.
- No markdown: no headings, no tables, no lists, no bold, no links. Plain sentences only.
- No hype adjectives (revolutionary, unprecedented, seismic, sovereign). Plain, specific, useful.
- If the digest does not support a claim, leave the claim out.

Return ONLY a JSON object in this exact shape:
{
  "tldr": ["five short sentences, each under 170 characters"],
  "sections": {
    "movement": "one paragraph of about 450 characters on what the star movement means",
    "architecture": "one paragraph of about 450 characters on how the cohorts differ and who each suits",
    "security": "one paragraph of about 450 characters on the runtime security split and its practical cost",
    "posture": "one paragraph of about 450 characters on local-first, cloud dependency and licensing"
  }
}`;

async function requestNarrative(digest: unknown): Promise<{ text: string; model: string } | null> {
    const { AI_PROVIDER, OPENROUTER_MODEL, NVIDIA_MODEL, NVIDIA_BASE_URL } = await import('./lib/config');
    const provider = AI_PROVIDER;
    const apiKey = provider === 'nvidia' ? process.env.NVIDIA_API_KEY : process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.warn(`Missing API key for ${provider}. Skipping analysis narrative.`);
        return null;
    }

    const model = provider === 'nvidia' ? NVIDIA_MODEL : OPENROUTER_MODEL;
    const baseUrl = provider === 'nvidia' ? NVIDIA_BASE_URL : 'https://openrouter.ai/api/v1';

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                // No `response_format`: support for it varies by provider and
                // model, and `parseResponse` already tolerates code fences and
                // a preamble, which is what reasoning models tend to emit.
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: `Computed digest for this cycle:\n${JSON.stringify(digest, null, 2)}\n\nWrite the JSON now.`,
                    },
                ],
            }),
        });

        const data: any = await response.json();
        if (!data.choices || data.choices.length === 0) {
            console.error('AI Error:', data);
            return null;
        }

        return { text: data.choices[0].message.content.trim(), model };
    } catch (error) {
        console.error('Error generating analysis narrative:', error);
        return null;
    }
}

export function parseResponse(text: string): { tldr: unknown; sections: unknown } | null {
    const unfenced = text
        .replace(/^```(?:json)?\n/, '')
        .replace(/\n```$/, '')
        .trim();

    try {
        return JSON.parse(unfenced);
    } catch {
        // Some providers prepend a sentence before the object.
        const start = unfenced.indexOf('{');
        const end = unfenced.lastIndexOf('}');
        if (start === -1 || end <= start) return null;
        try {
            return JSON.parse(unfenced.slice(start, end + 1));
        } catch (error) {
            console.error('Could not parse narrative JSON:', error);
            return null;
        }
    }
}

/**
 * Drops any string that is malformed or quotes an unbacked figure. Dropping is
 * preferred over failing the run: the page renders its computed fallbacks for
 * whatever is missing.
 */
export function sanitize(
    parsed: { tldr: unknown; sections: unknown },
    report: AnalysisReport,
): { tldr: string[]; sections: Record<string, string> } {
    const allowed = collectAllowedNumbers(report);
    const projectNames = report.archetypes.flatMap((archetype) =>
        archetype.members.map((member) => member.name),
    );

    /**
     * The number guard bounds which figures may appear but cannot tell which
     * project a sentence is attaching them to, and a per-project metric is
     * exactly the claim the old report kept getting wrong. Cohort-level
     * statements never name a single project, so the pairing is the signal.
     */
    const METRIC_UNITS = /\d\s*(?:ms\b|mb\b|\/\s*10\b|\/\s*100\b|out of (?:10|100)\b)/i;
    const namesAProject = (text: string) =>
        projectNames.find((name) =>
            new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text),
        );

    const accept = (
        value: unknown,
        limit: number,
        maxFigures: number,
        label: string,
    ): string | null => {
        if (typeof value !== 'string') return null;
        const text = value.trim();
        if (text.length === 0) return null;
        if (text.length > limit) {
            console.warn(`Rejected ${label}: ${text.length} chars exceeds ${limit}.`);
            return null;
        }
        if (/[#*|`]|\bhttps?:\/\//.test(text)) {
            console.warn(`Rejected ${label}: contains markdown or a link.`);
            return null;
        }
        const figures = text.match(/\d+(?:[.,]\d+)?k?/gi) ?? [];
        if (figures.length > maxFigures) {
            console.warn(
                `Rejected ${label}: ${figures.length} figures exceeds ${maxFigures}.`,
            );
            return null;
        }
        const unbacked = findUnbackedNumbers(text, allowed);
        if (unbacked.length > 0) {
            console.warn(`Rejected ${label}: unbacked figures ${unbacked.join(', ')}.`);
            return null;
        }
        const named = namesAProject(text);
        if (named && METRIC_UNITS.test(text)) {
            console.warn(
                `Rejected ${label}: quotes a per-project metric for ${named}; the tables own those.`,
            );
            return null;
        }
        return text;
    };

    const tldr = (Array.isArray(parsed.tldr) ? parsed.tldr : [])
        .map((item, index) =>
            accept(item, MAX_BULLET_CHARS, MAX_FIGURES_BULLET, `tldr[${index}]`),
        )
        .filter((item): item is string => item !== null);

    const sections: Record<string, string> = {};
    const rawSections = (parsed.sections ?? {}) as Record<string, unknown>;
    for (const key of SECTION_KEYS) {
        const value = accept(
            rawSections[key],
            MAX_SECTION_CHARS,
            MAX_FIGURES_SECTION,
            `sections.${key}`,
        );
        if (value) sections[key] = value;
    }

    return { tldr, sections };
}

export function loadReport(): AnalysisReport {
    const facts = fs
        .readdirSync(OUTPUT_DIR)
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
            const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf-8'));
            return toAnalysisFacts({ id: file.replace(/\.json$/, '').toLowerCase(), data });
        });

    let history: StarHistory = {};
    try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch {
        console.warn('Star history unavailable; the movement digest will be empty.');
    }

    return buildAnalysisReport(facts, history);
}

async function main() {
    const report = loadReport();
    const digest = buildNarrativeDigest(report);
    console.log(
        `Digest built for ${report.trackedCount} projects (data as of ${report.dataAsOf.slice(0, 10)}).`,
    );

    const response = await requestNarrative(digest);
    if (!response) {
        console.error('Narrative generation failed; the computed report stays as it is.');
        process.exitCode = 1;
        return;
    }

    const parsed = parseResponse(response.text);
    if (!parsed) {
        console.error('Narrative response was not usable JSON; nothing was written.');
        process.exitCode = 1;
        return;
    }

    const { tldr, sections } = sanitize(parsed, report);
    if (tldr.length < MIN_BULLETS) {
        console.warn(
            `Only ${tldr.length} summary bullets survived validation, below the ${MIN_BULLETS} needed; the page will fall back to computed highlights.`,
        );
    }

    const today = new Date().toISOString().split('T')[0];
    const narrative: Narrative = {
        generated_at: today,
        data_as_of: report.dataAsOf.slice(0, 10),
        model: response.model,
        tldr: tldr.length >= MIN_BULLETS ? tldr.slice(0, WANTED_BULLETS) : [],
        sections,
    };

    fs.writeFileSync(NARRATIVE_FILE, `${JSON.stringify(narrative, null, 2)}\n`, 'utf-8');
    fs.writeFileSync(
        METADATA_FILE,
        `${JSON.stringify({ lastUpdated: today }, null, 2)}\n`,
        'utf-8',
    );
    console.log(
        `Wrote ${narrative.tldr.length} summary bullets and ${Object.keys(sections).length} section paragraphs to ${NARRATIVE_FILE}.`,
    );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    main().catch((error) => {
        console.error('Analysis narrative run failed:', error);
        process.exitCode = 1;
    });
}
