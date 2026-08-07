# AGENTS.md

## Design Context

### Users
ClawClones is primarily for AI builders, developers, and early adopters who are evaluating OpenClaw alternatives. They are usually arriving with a practical decision in mind: quickly understand which clone deserves attention, compare tradeoffs, and decide what to investigate next.

### Brand Personality
The interface should feel confident, editorial, and intentional. It should read like a sharp, curated guide rather than a generic AI product or a noisy dashboard. The emotional target is trust through strong judgment, clear ranking, and disciplined presentation.

### Aesthetic Direction
The experience should lean toward confident editorial rather than gamer, corporate dashboard, or generic AI SaaS aesthetics. It should avoid purple-blue AI gradients, templated glassy landing-page patterns, cluttered portal composition, and over-hyped cyberpunk energy. The visual language should feel curated, informed, and opinionated while still carrying some personality.

### Design Principles
1. Prioritize rapid comparison over spectacle; the most important differences should surface fast.
2. Use editorial hierarchy and composition to signal judgment, not just decoration.
3. Avoid generic AI SaaS tropes and overbuilt dashboard clutter.
4. Keep interactions clear and discoverable with standard accessibility care, including strong contrast, focus states, and reduced-motion respect.
5. Make the product feel like a trusted field guide for builders, not a flashy trend page.

This repository is an Astro + React + Tailwind site for tracking the OpenClaw ecosystem.
It also includes Node/TypeScript data pipelines that fetch GitHub, Reddit, Brave, Cloudflare, and AI-generated analysis.
Most changes fall into one of two buckets:
- frontend UI in `src/`
- data/update scripts in `scripts/` and `functions/`

Use this file as the working agreement for agentic coding tools operating in this repo.

## Repository layout
- `src/pages/`: Astro routes and page entrypoints.
- `src/components/`: Astro and React UI components.
- `src/layouts/`: the page shell, metadata and navigation.
- `src/lib/`: logic shared between pages and pipelines — `compare` (canonical pair slugs), `compare-indexing` (which comparisons may be indexed), `analysis` (the ecosystem report's computed figures), `watchlist` (promotion thresholds), `activity`, `clone-format`, `content-signals`, `model-access` (labels and grouping for detected providers), `site`.
- `src/styles/global.css`: Tailwind v4 theme tokens, fonts, shared utility classes, animation helpers, and globals.
- `src/content/clones/` and `src/content/watchlist/`: generated JSON content collections; membership is decided by `projects.json`, not by what is in these folders.
- `src/content/config.ts`: Zod schemas for content collections; keep this aligned with generated JSON shapes.
- `src/data/`: generated analytics, star history, and report metadata.
- `scripts/` and `scripts/lib/`: Node/TS data pipelines plus shared helpers for fetch, normalize, and persistence logic.
- `functions/api/`: Cloudflare Pages Functions.
- `.github/workflows/`: scheduled refresh and deployment-related automation.
## Install and core commands
- Install dependencies: `npm install`
- Start local dev server: `npm run dev`
- Alternate dev alias: `npm run start`
- Preview the production build: `npm run preview`
- Astro CLI passthrough: `npm run astro -- <args>`
- Production build: `npm run build`
## Build, lint, and typecheck
There is no dedicated ESLint, Prettier, Biome, Vitest, Jest, Playwright, or Cypress configuration in this repo.
Validation is mostly Astro checking plus real script runs.
- Typecheck / Astro validation: `npm run astro -- check`
- Full build validation: `npm run build`
- `npm run build` runs, in order: `astro check`, `generate-indexable-compares`, `generate-compare-og-images`, `astro build`, `generate-compare-redirects`
- The two pre-build steps write into the tree: `src/data/indexable-compares.json` and `public/og/compare/`. Commit the first; the second is gitignored.
- Quick sanity check after UI edits: `npm run astro -- check && npm run build`
## Data pipeline commands
- Full ecosystem refresh: `npm run update-data`
- Targeted repo refresh: `npm run update-data -- --repos=owner/repo`
- Multiple targeted repos: `npm run update-data -- --repos=owner/repo,owner2/repo2`
- Env-based targeted refresh: `TARGET_REPOS=owner/repo npm run update-data`
- Lightweight GitHub-only refresh: `npm run update-github`
- Provider and default-model refresh: `npm run update-model-support` (no AI, Reddit or Brave calls; add `--dry-run` to print without writing)
- Watchlist refresh: `npm run update-watchlist`
- Regenerate the ecosystem report's narrative: `npm run update-analysis` (writes `src/data/analysis-narrative.json`; the report's tables are computed at build time and are never model-written)
- Recompute which comparisons may be indexed: `npm run generate-indexable-compares`
- Regenerate compare OG images: `npm run generate-compare-og`
- Generate partner JSON feed: `npm run generate-partner-feed`
- Fetch Cloudflare analytics: `npm run fetch-analytics`
## Test commands
There is no formal unit or integration test suite today.
The closest thing to tests is a mix of Astro validation and narrow smoke scripts.
- Reddit smoke test: `npx tsx scripts/test-reddit.ts`
- Brave search smoke test: `npx tsx scripts/test-brave.ts`
- Full site validation: `npm run build`
## Running a single test
There is no single-test runner because there is no test framework configured.
Use the narrowest equivalent that matches your change:
- Single frontend/content validation pass: `npm run astro -- check`
- Single repo data refresh: `npm run update-data -- --repos=owner/repo`
- Single provider smoke test, Reddit: `npx tsx scripts/test-reddit.ts`
- Single provider smoke test, Brave: `npx tsx scripts/test-brave.ts`
- Single watchlist refresh path: `npm run update-watchlist`
If a real test framework is added later, update this file with exact single-file and single-test-name commands.
## Verification guidance by change type
- UI-only change: run `npm run astro -- check && npm run build`
- Content schema or collection change: run `npm run astro -- check`
- Data pipeline change: run the narrowest relevant `tsx` smoke script or targeted `npm run update-data -- --repos=...`
- Partner feed or API change: run `npm run build` and manually inspect the affected endpoint behavior if possible
## Environment variables commonly used
- `GITHUB_TOKEN`: GitHub API access for repo metadata and releases.
- `BRAVE_API_KEY`: Brave Search fetcher for per-clone web mentions. The Reddit fetcher needs no credentials; it reads the public search feed with a descriptive User-Agent.
- `AI_PROVIDER` (`nvidia` or `openrouter`) plus the matching `NVIDIA_API_KEY`/`NVIDIA_MODEL` or `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`: AI generation pipeline.
- `AI_REQUEST_TIMEOUT_MS`: per-request ceiling, 300000 by default. Reasoning models need the headroom; the previous two-minute cap aborted them mid-answer.
- `WATCHLIST_AUTO_PROMOTE`: whether a watchlist entry that clears the thresholds promotes itself. Currently on.
- `TARGET_REPOS`: restrict a data run to specific `owner/repo` entries.
- See `.env.example` for the full list with comments.
- `PARTNER_API_KEYS`: the Cloudflare Pages Function guarding the partner feed; set it as a Pages variable, not a GitHub secret.
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`: page analytics. The token needs only Zone / Analytics / Read.
If a required secret is missing, many scripts warn and skip that provider rather than hard-failing the whole run.
## Code style: general rules
- Use TypeScript everywhere; the repo extends `astro/tsconfigs/strict`.
- Prefer explicit interfaces/types for shared shapes, props, and pipeline payloads.
- Use `import type` for type-only imports when it improves clarity.
- Prefer small pure helpers in `src/lib/` or `scripts/lib/` over inline repeated logic.
- Keep functions focused; split fetch, transform, and persistence responsibilities when practical.
- Prefer early returns over deeply nested branches.
- Preserve existing file-local style when editing; there is no formatter enforcing one exact style.
- Do not reformat unrelated code just to make style uniform.
- Keep new files ASCII unless the file already relies on non-ASCII text.
- Use semicolons; the existing codebase generally does.
## Imports
- Order imports from general to local: built-ins, third-party packages, then project-relative modules.
- Side-effect imports like `import 'dotenv/config';` usually appear near the top of script files.
- Frontend files use relative imports like `../components/...`; there is no active path-alias convention.
- Prefer named exports for utilities and helper modules.
- UI components usually default-export the component itself.
## Naming conventions
- React and Astro components: `PascalCase` filenames and symbols.
- Utility functions and locals: `camelCase`.
- Environment/config constants: `UPPER_SNAKE_CASE`.
- Shared prop/type interfaces: `PascalCase`, often `Props` or a descriptive `*Props` name.
- Content/data JSON keys use `snake_case`.
- Watchlist and clone IDs use GitHub `owner/repo` strings where applicable.
## Formatting conventions
- Scripts and many TS/TSX files commonly use 4-space indentation.
- Some Astro files use tabs; do not normalize them unless you are already editing those lines.
- Multiline objects and arrays usually include trailing commas when written across multiple lines.
- Keep JSON pretty-printed with 2 spaces.
- Match quote style already used in the file; do not churn quote style repo-wide.
- Keep comments sparse; add them only when a block is genuinely non-obvious.
## Types and schema expectations
- Frontend content schemas live in `src/content/config.ts`; keep them in sync with JSON content changes.
- Generated clone/watchlist JSON must satisfy the Zod schema consumed by Astro content collections.
- Avoid introducing new `any` types unless the upstream API shape is genuinely unstable.
- If you must use `any`, keep it close to API boundaries and do not let it spread.
- Prefer nullable or optional properties over sentinel strings when modeling missing external data.
- When changing generated JSON structure, update both producers and consumers in the same change.

## Error handling and resilience
- Wrap network access, file reads, and JSON parsing in `try/catch`.
- Log errors with repo/file/context so batch jobs remain debuggable.
- Follow existing pipeline style: warn and continue when a single repo or provider fails.
- Return `null` or a safe fallback when the caller already expects nullable failures.
- For API handlers, return explicit HTTP status codes and JSON error bodies.
- Keep auth and guard checks early in request handling.

## Async and performance patterns
- Use `Promise.all` only for independent remote calls.
- Keep sequential loops when order or rate sensitivity matters.
- Existing scripts favor resilient batch processing over maximum concurrency.
- Avoid adding unnecessary client-side state when Astro server-side rendering can do the job.

## Frontend conventions
- Prefer Astro for page composition and static data loading.
- Use React components for interactive widgets like search, compare, charts, and modals.
- Tailwind utility classes are the default styling approach.
- Reuse theme tokens from `src/styles/global.css` instead of inventing ad hoc colors.
- The palette is a light-first "paper and ink" set that flips in `.dark`: `paper`, `ink`, `accent`, `accent-soft`, `line`, `surface`, plus the `pale-slate` ramp. Shade numbers encode a contrast role against the page background, not a fixed colour, which is why they invert with the theme.
- Reuse the utility helpers rather than re-deriving them: `hairline` (divider colour), `eyebrow` (mono section kicker), `btn-primary` (the only filled button), `pill` (status chips), `glass-nav`, `markdown-body`.
- Corners are 2px and there are no drop shadows; both are set through theme tokens, so do not reintroduce them per component.
- Keep pages responsive, and keep the restraint: the design reads as editorial, not expressive.

## Data and content editing rules
- Treat `src/content/clones/`, `src/content/watchlist/`, and `src/data/` as generated or generation-adjacent data.
- When changing generator scripts, consider whether corresponding JSON outputs or schemas must also change.
- Do not hand-edit generated content unless the task explicitly calls for content fixes.
- `projects.json` is the single source of truth for membership: each entry is `{ repo, status, since? }` with status `tracked`, `watching` or `archived`. Promotion is a status change, not a move between files.
- Validate it through `scripts/lib/projects.ts`; the loader rejects duplicates and malformed repo names rather than letting them reach the pipeline.

## Model support detection
- `scripts/lib/model-support.ts` holds the detection rules and is deliberately network-free, so the same logic runs against the GitHub API in the pipeline and against a local checkout in a smoke test.
- Sources are read through `RepoFileSource` (`scripts/lib/repo-source.ts`): `GitHubRepoSource` for pipeline runs, `LocalRepoSource` for a checkout on disk.
- A provider is only reported when a file backs it. Every published claim carries the file it came from, and the profile page links to that file.
- `model_support` is measured data: `normalizeCloneData` reads it from `measured` and never from the AI response. Do not let a generated field write into it.
- Empty `providers` means detection found nothing, which is not the same as the project supporting nothing. Keep that distinction in any UI that consumes the field.
- Adding a provider means adding an entry to `PROVIDER_RULES`; prefer a dependency name or env key over a bare endpoint string, since endpoints also appear in documentation and router tables.
- Model age comes from `scripts/lib/model-catalogue.ts`: the date inside the model id when it has one, otherwise OpenRouter's public catalogue (`created`). No hand-maintained release table — it would rot, and it would be authored rather than measured.
- `normalizeModelId` may only restore identities (`claude-sonnet-4-5` = `claude-sonnet-4.5`), never approximate a near match. Dating a pin from a different model is worse than leaving it null.
- The catalogue cannot date a model its providers have retired, so unknown ages skew toward the oldest pins. The bias runs toward under-reporting staleness, which is the safe direction; do not add fallbacks that guess.

## Cloudflare function conventions
- Files in `functions/api/` export `onRequest` handlers.
- Return `Response` objects directly.
- Preserve CORS and cache headers when modifying public API endpoints.
- Keep authentication checks explicit and early.
