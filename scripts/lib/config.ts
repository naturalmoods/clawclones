import * as path from 'path';

export const OUTPUT_DIR = path.join(process.cwd(), 'src', 'content', 'clones');
export const WATCHLIST_OUTPUT_DIR = path.join(process.cwd(), 'src', 'content', 'watchlist');
export const DATA_DIR = path.join(process.cwd(), 'src', 'data');
export const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

export const DEFAULT_REPOS = [
    'openclaw/openclaw',
    'zeroclaw-labs/zeroclaw',
    'qwibitai/nanoclaw',
    'HKUDS/nanobot',
    'sipeed/picoclaw',
    'nearai/ironclaw'
];

export const REDDIT_AI_KEYWORDS = ['ai', 'llm', 'model', 'clone', 'fork', 'code', 'github', 'assistant', 'openclaw', 'tech', 'software', 'dev', 'agent'];
export const REDDIT_BANNED_SUBREDDITS = ['cricket', 'sports', 'football', 'soccer', 'basketball', 'ipl', 'pakistan', 'india', 'skyrim', 'gaming'];
export const REDDIT_IRRELEVANT_KEYWORDS = ['wicket', 'match', 'potm', 'scorecard', 'player of the match', 'pakistan', 'india', 'husband', 'wife', 'relationship', 'manhwa', 'epstein', 'eldritch', 'daughter', 'father', 'vampire', 'dawnguard'];

export type AIProvider = 'openrouter' | 'nvidia' | 'groq';

export const AI_PROVIDER: AIProvider = (process.env.AI_PROVIDER as AIProvider) || 'nvidia';

export const OPENROUTER_MODEL =
    process.env.OPENROUTER_MODEL || '~deepseek/deepseek-v4-flash-latest';
export const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'moonshotai/kimi-k3';
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
