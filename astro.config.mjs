// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';

/**
 * The same list the compare page uses for its `robots` meta, produced by
 * `scripts/generate-indexable-compares.ts`. Reading it here keeps the sitemap
 * and the meta tag from disagreeing; when the file is absent the filter falls
 * back to the OpenClaw pairs.
 */
function loadIndexableCompares() {
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), 'src', 'data', 'indexable-compares.json'),
      'utf8',
    );
    return new Set(JSON.parse(raw).slugs ?? []);
  } catch {
    return null;
  }
}

const indexableCompares = loadIndexableCompares();

/** @param {string} page */
function isIndexablePage(page) {
  if (page.includes('404')) return false;
  const match = page.match(/\/compare\/([^/]+)\/?$/);
  if (!match) return true;

  const slug = match[1];
  return indexableCompares ? indexableCompares.has(slug) : slug.includes('openclaw');
}

// https://astro.build/config
export default defineConfig({
  site: 'https://clawclones.com',
  vite: {
    // @ts-ignore
    plugins: [tailwindcss()]
  },

  integrations: [
    icon(),
    react(),
    sitemap({
      // Covers the dynamic [id] and [clones] routes too; the compare matrix is
      // narrowed to the pairs that earn indexing.
      filter: isIndexablePage,
    })
  ]
});