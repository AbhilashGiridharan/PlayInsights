# 🎭 Playwright Results Dashboard

A **zero-backend static dashboard** that visualizes Playwright test results after every CI run.  
Results are stored as JSON files committed to this repo and served over `raw.githubusercontent.com`.  
The dashboard is a Vite + React + TypeScript SPA deployed to GitHub Pages.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Running Tests Locally](#running-tests-locally)
3. [Generating a Local Dashboard Preview](#generating-a-local-dashboard-preview)
4. [CI / GitHub Actions Overview](#ci--github-actions-overview)
5. [Creating the GitHub Repo & Enabling Pages](#creating-the-github-repo--enabling-pages)
6. [First CI Run – Where to Find the Playwright HTML Report](#first-ci-run--where-to-find-the-playwright-html-report)
7. [Viewing the Live Dashboard](#viewing-the-live-dashboard)
8. [Configuration Reference](#configuration-reference)
9. [Data Format](#data-format)
10. [Linking Run Rows to the Playwright HTML Report Artifact](#linking-run-rows-to-the-playwright-html-report-artifact)
11. [FAQ](#faq)

---

## Project Structure

```
playwright-results-dashboard/
├── .github/
│   └── workflows/
│       └── test-and-publish.yml  ← CI: test → summarize → deploy
├── data/
│   ├── index.json                ← auto-generated index of all run files
│   ├── last.json                 ← most recent run summary (auto-updated)
│   └── runs/
│       └── YYYY-MM-DD_HH-mm-ss.json   ← per-run summaries
├── scripts/
│   ├── summarize-results.ts      ← transforms playwright JSON report → summary JSON
│   └── update-index.ts           ← regenerates data/index.json
├── site/                         ← Vite + React + TS dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   ├── config.ts             ← DATA_BASE URL, AUTO_REFRESH_MS, etc.
│   │   ├── types.ts
│   │   ├── hooks/useData.ts
│   │   └── components/
│   │       ├── SummaryCards.tsx
│   │       ├── TrendCharts.tsx
│   │       └── RunsTable.tsx
│   └── package.json
├── tests/
│   └── example.spec.ts           ← sample Playwright tests
├── playwright.config.ts
├── package.json                  ← root – Playwright + script deps
└── tsconfig.scripts.json
```

---

## Running Tests Locally

```bash
# 1. Install dependencies (Playwright + ts-node)
npm install

# 2. Install browser binaries
npx playwright install --with-deps

# 3. Run tests
npm test

# After the run you'll find:
#   playwright-report/index.html   ← interactive HTML report
#   playwright-report/results.json ← machine-readable JSON (input to summarize script)
#   data/runs/<timestamp>.json     ← compact summary
#   data/last.json                 ← same, aliased as "latest"
#   data/index.json                ← updated index
```

> The `posttest` hook automatically runs `npm run summarize` and `npm run update:index`
> after each test run.

---

## Generating a Local Dashboard Preview

```bash
# Option A: copy data into the Vite public folder and run dev server
cd site
ln -s ../../data public/data   # symlink on macOS/Linux
npm install
npm run dev
# Open http://localhost:5173
```

The site reads from `/data` in dev mode (Vite serves `public/` automatically).  
`DATA_BASE` falls back to `/data` when `import.meta.env.DEV` is `true`
(see [site/src/config.ts](site/src/config.ts)).

---

## CI / GitHub Actions Overview

The workflow at [.github/workflows/test-and-publish.yml](.github/workflows/test-and-publish.yml)
has three jobs that run in sequence on every push to `main`:

| Job | What it does |
|-----|-------------|
| **test** | Installs deps, installs browsers, runs `npm test`, uploads `playwright-html-report` artifact |
| **summarize-and-commit** | Downloads the artifact, runs `summarize-results.ts` + `update-index.ts`, commits `data/` to `main` |
| **build-and-deploy-pages** | Pulls updated `main`, builds the Vite site, deploys `site/dist` to GitHub Pages |

The workflow runs even when tests **fail** (so failure data is always committed and visible in the dashboard).

---

## Creating the GitHub Repo & Enabling Pages

### Step 1 – Create the repository

```bash
# On GitHub.com: New → Repository → name it "playwright-results-dashboard"
# Visibility: Public (required for free GitHub Pages)
# Do NOT initialize with a README (you already have one)
```

### Step 2 – Push code

```bash
cd /path/to/playwright-results-dashboard
git init
git add .
git commit -m "feat: initial scaffold"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/playwright-results-dashboard.git
git push -u origin main
```

### Step 3 – Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages** (left sidebar).
2. Under **Source**, choose **GitHub Actions**.
3. Click **Save**.

That's it! After the first successful CI run the URL will appear:
`https://<YOUR_USERNAME>.github.io/playwright-results-dashboard/`

### Step 4 – Update `config.ts` with your details

Edit [site/src/config.ts](site/src/config.ts):

```ts
export const GITHUB_OWNER  = "YOUR_GITHUB_USERNAME";
export const GITHUB_REPO   = "playwright-results-dashboard";
export const GITHUB_BRANCH = "main";
```

Then push – CI will rebuild and redeploy automatically.

---

## First CI Run – Where to Find the Playwright HTML Report

1. Push to `main` to trigger the workflow.
2. Go to **Actions** tab in your GitHub repo.
3. Click the most recent **"🎭 Test → Summarize → Publish"** workflow run.
4. Click the **test** job.
5. Scroll to the **Artifacts** section at the bottom (or click **Summary** at the top of the run).
6. Download **`playwright-html-report`** – it's a zip containing the full HTML report.
7. Unzip and open `index.html` in your browser.

### Direct artifact URL template

The artifact download URL follows this pattern (requires GitHub login):

```
https://github.com/<OWNER>/<REPO>/actions/runs/<RUN_ID>/artifacts/<ARTIFACT_ID>
```

You can also construct a direct link to the HTML report for a run using
the `ciUrl` field stored in each JSON summary. Every run row in the dashboard
links to the CI run page, from where you can download the artifact.

---

## Viewing the Live Dashboard

Once Pages is enabled and CI has run at least once:

```
https://<YOUR_USERNAME>.github.io/playwright-results-dashboard/
```

- The site auto-refreshes every **5 minutes** (configurable via `?refresh=<ms>`).
- Click **↺ Refresh** for an immediate reload.
- Use the **Project / Branch / Suite / Status** filters in the Runs table.
- The dashboard shows data from `raw.githubusercontent.com` – no CORS issues.

---

## Configuration Reference

### `site/src/config.ts`

| Export | Default | Description |
|--------|---------|-------------|
| `GITHUB_OWNER` | `"owner"` | Your GitHub username or org |
| `GITHUB_REPO` | `"playwright-results-dashboard"` | Repository name |
| `GITHUB_BRANCH` | `"main"` | Branch where data/ is committed |
| `DATA_BASE` | auto | Full URL to `/data`. Override via `VITE_DATA_BASE` env var at build time |
| `AUTO_REFRESH_MS` | `300000` | Auto-refresh interval (ms). Override via `?refresh=<ms>` URL param |
| `STALE_THRESHOLD_MS` | `86400000` | Show "stale data" warning after 24 h |
| `MAX_RUNS` | `100` | Max run files to fetch |
| `SPARKLINE_DAYS` | `14` | Number of runs shown in sparklines & trend charts |

### Environment variables consumed by CI scripts

| Variable | Source | Description |
|----------|--------|-------------|
| `GITHUB_SHA` | GitHub Actions | Full commit SHA |
| `GITHUB_REF_NAME` | GitHub Actions | Branch / tag name |
| `GITHUB_RUN_ID` | GitHub Actions | Actions run ID |
| `GITHUB_SERVER_URL` | GitHub Actions | `https://github.com` |
| `GITHUB_REPOSITORY` | GitHub Actions | `owner/repo` |
| `GITHUB_ACTOR` | GitHub Actions | Triggering user |

---

## Data Format

Each file under `data/runs/` and `data/last.json` follows this schema:

```jsonc
{
  "runId":     "<shortSha>_<timestamp>",
  "timestamp": "<ISO 8601>",
  "branch":    "main",
  "commit":    "<full SHA>",
  "author":    "octocat",
  "ciUrl":     "https://github.com/owner/repo/actions/runs/12345",
  "totals":    { "passed": 12, "failed": 0, "skipped": 1, "flaky": 0 },
  "durations": { "totalMs": 25800, "avgTestMs": 2150, "p95TestMs": 4600 },
  "passRate":  100,
  "suites": [
    { "name": "tests/example.spec.ts", "passed": 12, "failed": 0, "skipped": 1, "durationMs": 25800 }
  ],
  "projects": [
    { "name": "chromium", "passed": 4, "failed": 0, "skipped": 0 },
    { "name": "firefox",  "passed": 4, "failed": 0, "skipped": 1 },
    { "name": "webkit",   "passed": 4, "failed": 0, "skipped": 0 }
  ]
}
```

`data/index.json` is an array of lightweight pointers:

```jsonc
[
  { "filename": "2026-03-11_00-00-00.json", "timestamp": "2026-03-11T00:00:00.000Z", "runId": "78945678_2026-03-11_00-00-00" },
  ...
]
```

---

## Linking Run Rows to the Playwright HTML Report Artifact

The `ciUrl` field in each summary points to the GitHub Actions run page:

```
https://github.com/<OWNER>/<REPO>/actions/runs/<RUN_ID>
```

From that page, click **Artifacts → playwright-html-report** to download the report.

If you want a **direct deep link** (only possible programmatically via the API),
use the [GitHub REST API](https://docs.github.com/en/rest/actions/artifacts):

```
GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts
```

The response includes `archive_download_url` for each artifact.

---

## FAQ

**Q: Can I use a private repo?**  
A: Yes, but `raw.githubusercontent.com` is not publicly accessible for private repos.
You'll need to either use GitHub Pages with authentication or self-host the data endpoint.
The simplest option: keep the dashboard on public Pages and your test code private.

**Q: How do I add more tests?**  
A: Add `.spec.ts` files under `tests/`. They are automatically picked up by Playwright.

**Q: How do I change the refresh interval?**  
A: Pass `?refresh=60000` in the URL for 1-minute refresh, or edit `AUTO_REFRESH_MS` in `config.ts`.

**Q: The charts show no data / the dashboard is blank.**  
A: Ensure `GITHUB_OWNER`, `GITHUB_REPO`, and `GITHUB_BRANCH` in `site/src/config.ts`
match your actual repo. CORS is handled because `raw.githubusercontent.com` is permissive.

**Q: How do I reset historical data?**  
A: Delete files from `data/runs/`, update `data/index.json`, and push.
The `update-index.ts` script regenerates the index automatically.
