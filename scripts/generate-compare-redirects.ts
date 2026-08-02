import fs from 'fs';
import path from 'path';
import {
    getCanonicalComparePath,
    getCompareSlug,
    getLegacyCompareSlug
} from '../src/lib/compare';

interface RedirectClone {
    id: string;
    data: {
        name?: string;
    };
}

const CLONES_DIR = path.join(process.cwd(), 'src', 'content', 'clones');
const PUBLIC_REDIRECTS_PATH = path.join(process.cwd(), 'public', '_redirects');
const DIST_REDIRECTS_PATH = path.join(process.cwd(), 'dist', '_redirects');

function loadClones(): RedirectClone[] {
    return fs
        .readdirSync(CLONES_DIR)
        .filter(file => file.endsWith('.json'))
        .map(file => ({
            id: path.basename(file, '.json'),
            data: JSON.parse(
                fs.readFileSync(path.join(CLONES_DIR, file), 'utf8'),
            ),
        }));
}

function addRule(rules: Set<string>, from: string, to: string) {
    if (from === to) return;
    rules.add(`${from} ${to} 302`);
}

function main() {
    const clones = loadClones();
    const rules = new Set<string>();

    for (let i = 0; i < clones.length; i++) {
        for (let j = i + 1; j < clones.length; j++) {
            const cloneA = clones[i];
            const cloneB = clones[j];
            if (!cloneA || !cloneB) continue;

            const canonicalPath = getCanonicalComparePath(cloneA, cloneB);
            const canonicalA = getCompareSlug(cloneA);
            const canonicalB = getCompareSlug(cloneB);
            const legacyA = encodeURIComponent(getLegacyCompareSlug(cloneA));
            const legacyB = encodeURIComponent(getLegacyCompareSlug(cloneB));

            addRule(
                rules,
                `/compare/${canonicalB}-vs-${canonicalA}`,
                canonicalPath,
            );
            addRule(rules, `/compare/${legacyA}-vs-${legacyB}`, canonicalPath);
            addRule(rules, `/compare/${legacyB}-vs-${legacyA}`, canonicalPath);
        }
    }

    const existingRules = fs.existsSync(PUBLIC_REDIRECTS_PATH)
        ? fs.readFileSync(PUBLIC_REDIRECTS_PATH, 'utf8').trim()
        : '';
    const redirectContent = [existingRules, ...rules]
        .filter(Boolean)
        .join('\n')
        .concat('\n');

    fs.writeFileSync(DIST_REDIRECTS_PATH, redirectContent);
    console.log(`Generated ${rules.size} compare redirects at ${DIST_REDIRECTS_PATH}`);
}

main();
