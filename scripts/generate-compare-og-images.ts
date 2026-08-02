import fs from 'fs';
import path from 'path';
import { getCanonicalCompareSlugs, getCompareSlug } from '../src/lib/compare';

interface Clone {
    id: string;
    name: string;
    language: string;
    github_stars: number;
    vibe_summary: string;
}

const CLONES_DIR = path.join(process.cwd(), 'src', 'content', 'clones');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'og', 'compare');

function escapeSvg(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
    })[character] || character);
}

function shortName(clone: Clone): string {
    return clone.name.split('/').pop() || clone.name;
}

function formatStars(stars: number): string {
    return stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}k` : String(stars);
}

function renderImage(left: Clone, right: Clone): string {
    const title = `${shortName(left)} vs ${shortName(right)}`;
    const subtitle = `${left.language} · ${formatStars(left.github_stars)} stars     ${right.language} · ${formatStars(right.github_stars)} stars`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeSvg(title)} OpenClaw comparison">
  <rect width="1200" height="630" fill="#0a0c10"/>
  <rect x="48" y="48" width="1104" height="534" rx="36" fill="#11151c" stroke="#373f47"/>
  <rect x="48" y="48" width="14" height="534" rx="7" fill="#ff5733"/>
  <text x="110" y="145" fill="#aaabbc" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="3">OPENCLAW ALTERNATIVES COMPARED</text>
  <text x="110" y="290" fill="#ffffff" font-family="Arial, sans-serif" font-size="72" font-weight="700">${escapeSvg(shortName(left))}</text>
  <text x="110" y="370" fill="#ff5733" font-family="Arial, sans-serif" font-size="36" font-weight="700">VS</text>
  <text x="110" y="470" fill="#c3c9e9" font-family="Arial, sans-serif" font-size="72" font-weight="700">${escapeSvg(shortName(right))}</text>
  <text x="110" y="535" fill="#aaabbc" font-family="Arial, sans-serif" font-size="26">${escapeSvg(subtitle)}</text>
  <text x="1030" y="535" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="700" text-anchor="end">CLAWCLONES</text>
</svg>`;
}

function loadClones(): Clone[] {
    return fs.readdirSync(CLONES_DIR)
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
            const data = JSON.parse(fs.readFileSync(path.join(CLONES_DIR, file), 'utf8')) as Omit<Clone, 'id'>;
            return { ...data, id: path.basename(file, '.json') };
        });
}

function main() {
    const clones = loadClones();
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    let generated = 0;
    for (let i = 0; i < clones.length; i++) {
        for (let j = i + 1; j < clones.length; j++) {
            const left = clones[i];
            const right = clones[j];
            if (!left || !right) continue;
            const [firstSlug, secondSlug] = getCanonicalCompareSlugs(left, right);
            const [first, second] = getCompareSlug(left) === firstSlug ? [left, right] : [right, left];
            const outputPath = path.join(OUTPUT_DIR, `${firstSlug}-vs-${secondSlug}.svg`);
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, renderImage(first, second));
            generated++;
        }
    }

    console.log(`Generated ${generated} compare OG images at ${OUTPUT_DIR}`);
}

main();
