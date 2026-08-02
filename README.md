# ClawClones

A tracker and comparison site for the OpenClaw ecosystem — every serious fork and
alternative, measured on the same axes, so choosing one takes minutes instead of an
afternoon.

**Live:** [clawclones.com](https://clawclones.com)

## What it does

- **Index** — every tracked project in one sortable table: stars, memory footprint,
  boot time, security score, licence, commit activity.
- **Profiles** — a page per project with the security radar, star history, and an
  AI-written read on where it beats or loses to OpenClaw.
- **Compare** — any two projects side by side, with a verdict that names who each
  one suits.
- **Ecosystem report** — a weekly state-of-the-field report whose tables are computed
  from the tracked data at build time.
- **Ecosystem map** — the whole field as one orbit map, sized by stars and coloured
  by language.

## Measured, AI-written, community

The interesting constraint in this project is keeping those three apart:

| Lane | What it covers | Where it comes from |
| --- | --- | --- |
| **Measured** | Stars, releases, commit tempo, language, footprint, licence | GitHub API, stored as typed fields under `src/content/clones/` |
| **AI-written** | Summaries, tradeoffs, compare verdicts, recommendation framing | Generation pipeline in `scripts/`, always labelled in the UI |
| **Community** | Discussion volume and web mentions | Reddit public search feed, Brave Search |

Numbers are never authored by a model. The ecosystem report used to be generated as
freeform markdown and drifted badly from the underlying data, so it now computes every
figure in `src/lib/analysis.ts` at build time and lets the model write only the
connective copy — which is then rejected if it quotes a figure the report cannot back.

## Stack

Astro 5 with content collections, React islands for the interactive bits (search,
compare, charts), Tailwind v4, ECharts. Data pipelines are standalone Node/TypeScript
scripts run on a schedule by GitHub Actions, which commit their output back to the
repo. Deployed on Cloudflare Pages, with one Pages Function serving the partner feed.

## Quick start

```sh
npm install
npm run dev
```

The generated content under `src/content/` and `src/data/` is committed, so the site
builds and runs with no API keys at all. You only need credentials to re-run the data
pipelines — copy `.env.example` to `.env` and fill in what you need.

```sh
npm run build          # astro check + OG images + build + compare redirects
npm run astro -- check # types and content-schema validation on its own
```

## Data pipelines

| Command | What it refreshes |
| --- | --- |
| `npm run update-data` | Full ecosystem pass: repos, community signals, AI copy |
| `npm run update-data -- --repos=owner/repo` | A single project |
| `npm run update-github` | GitHub metadata only, no AI calls |
| `npm run update-watchlist` | The radar list of unverified newcomers |
| `npm run update-analysis` | The weekly ecosystem report narrative |
| `npm run fetch-analytics` | Cloudflare page analytics |
| `npm run generate-partner-feed` | The public JSON feed |

Every provider degrades gracefully: a missing key logs a warning and skips that
source instead of failing the run.

## Layout

```
src/pages/          routes
src/components/     Astro + React UI
src/lib/            shared logic (compare, analysis, formatting, signals)
projects.json       which repos are tracked, watched or archived
src/content/        generated clone + watchlist JSON, validated by Zod
src/data/           generated star history, analytics, report metadata
scripts/            data pipelines
functions/api/      Cloudflare Pages Functions
```

`AGENTS.md` holds the working conventions in more detail — code style, naming, and
the verification steps expected per kind of change.

## Contributing

Corrections are the most useful contribution. Two issue forms cover the common
cases, and both are also reachable from the site itself:

- **Clone nomination** — a fork or alternative that should be tracked. Faster
  still: open a PR adding the repo to `projects.json` with `"status": "tracked"`, and
  the pipeline generates the profile from there.
- **Data correction** — a wrong, stale or misleading figure on a profile or
  comparison. A link to the source beats a description.

For code, keep changes scoped and run `npm run astro -- check && npm run build`
before opening a PR.

Do not hand-edit files under `src/content/` or `src/data/` — they are pipeline
output. Change the generator instead.

## Licence

MIT — see [LICENSE](LICENSE).
