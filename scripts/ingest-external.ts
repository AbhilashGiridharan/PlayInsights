#!/usr/bin/env ts-node
/**
 * scripts/ingest-external.ts
 *
 * Pulls Cucumber JSON reports from AbhilashGiridharan/InsightsLogs and
 * converts them to the RunSummary format used by this dashboard, writing
 * one JSON file per run-folder into data/runs/.
 *
 * Already-ingested runs are detected by file presence and skipped, so
 * this script is safe to run on every CI push (incremental / idempotent).
 *
 * Environment variables (optional):
 *   GITHUB_TOKEN   – Personal-access-token or Actions GITHUB_TOKEN for
 *                    authenticated API calls (avoids 60 req/hr anon limit).
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";

// ── Config ────────────────────────────────────────────────────────────────────

const EXTERNAL_OWNER = "AbhilashGiridharan";
const EXTERNAL_REPO  = "InsightsLogs";
const EXTERNAL_PATH  = "Test-Automation"; // folder inside the repo that holds run dirs
const SOURCE_LABEL   = "InsightsLogs";    // shown in the dashboard "Source" column

const GITHUB_TOKEN   = process.env.GITHUB_TOKEN ?? "";

// ── Cucumber JSON types ───────────────────────────────────────────────────────

interface CucumberStepResult {
  status: string;     // "passed" | "failed" | "skipped" | "pending" | "undefined"
  duration?: number;  // nanoseconds
  error_message?: string;
}

interface CucumberStep {
  keyword: string;
  name?: string;
  result?: CucumberStepResult;
  hidden?: boolean;
}

interface CucumberElement {
  id: string;
  name: string;
  keyword: string; // "Scenario" | "Scenario Outline" | "Background"
  steps: CucumberStep[];
  tags?: Array<{ name: string }>;
}

interface CucumberFeature {
  id: string;
  name: string;
  uri: string;
  elements: CucumberElement[];
}

// ── Output types (mirror summarize-results.ts RunSummary) ────────────────────

interface SuiteSummary {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

interface ProjectSummary {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
}

interface RunSummary {
  runId:     string;
  timestamp: string;
  branch:    string;
  commit:    string;
  author:    string;
  ciUrl:     string;
  source:    string;
  totals:    { passed: number; failed: number; skipped: number; flaky: number };
  durations: { totalMs: number; avgTestMs: number; p95TestMs: number };
  passRate:  number;
  suites:    SuiteSummary[];
  projects:  ProjectSummary[];
}

interface ExternalSummary {
  timestamp:   string;
  feature:     string;
  status:      string;
  generatedAt: string;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpsGetString(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const headers: Record<string, string> = {
      "User-Agent": "InsightsDemo-Ingest/1.0",
      "Accept":     "application/vnd.github.v3+json",
    };
    if (GITHUB_TOKEN) headers["Authorization"] = `token ${GITHUB_TOKEN}`;

    const req = https.get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers },
      (res) => {
        // Follow redirects (raw.githubusercontent.com may 302)
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          return httpsGetString(res.headers.location).then(resolve).catch(reject);
        }
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => resolve(body));
      }
    );
    req.on("error", reject);
  });
}

async function githubApiGet<T>(apiPath: string): Promise<T> {
  const url = `https://api.github.com${apiPath}`;
  const body = await httpsGetString(url);
  return JSON.parse(body) as T;
}

async function rawFileGet(downloadUrl: string): Promise<string> {
  return httpsGetString(downloadUrl);
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Cucumber conversion ───────────────────────────────────────────────────────

/** Derive pass/fail/skip for a single Cucumber scenario element. */
function scenarioStatus(el: CucumberElement): "passed" | "failed" | "skipped" {
  const steps = el.steps.filter((s) => !s.hidden && s.result);
  if (steps.length === 0) return "skipped";
  if (steps.some((s) => s.result!.status === "failed" || s.result!.status === "undefined")) return "failed";
  if (steps.every((s) => s.result!.status === "skipped" || s.result!.status === "pending")) return "skipped";
  return "passed";
}

/** Sum step durations (nanoseconds) → milliseconds. */
function elementDurationMs(el: CucumberElement): number {
  return el.steps.reduce(
    (sum, s) => sum + Math.round((s.result?.duration ?? 0) / 1_000_000),
    0
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repoRoot    = path.resolve(__dirname, "..");
  const dataRunsDir = path.join(repoRoot, "data", "runs");
  fs.mkdirSync(dataRunsDir, { recursive: true });

  // 1. List run folders (directories) in Test-Automation/
  type GHItem = { type: string; name: string; download_url: string | null };
  const rootItems = await githubApiGet<GHItem[]>(
    `/repos/${EXTERNAL_OWNER}/${EXTERNAL_REPO}/contents/${EXTERNAL_PATH}`
  );
  const folders = rootItems
    .filter((i) => i.type === "dir")
    .map((i) => i.name)
    .sort();

  console.log(
    `[ingest] Found ${folders.length} run folder(s) in ` +
    `${EXTERNAL_OWNER}/${EXTERNAL_REPO}/${EXTERNAL_PATH}`
  );

  let ingested = 0;
  let alreadyDone = 0;

  for (const folder of folders) {
    const outFile = path.join(dataRunsDir, `${SOURCE_LABEL}_${folder}.json`);

    if (fs.existsSync(outFile)) {
      console.log(`[ingest] ⏭  Already ingested: ${folder}`);
      alreadyDone++;
      continue;
    }

    console.log(`[ingest] ↓  Processing: ${folder}`);

    // 2. List files in the run folder
    const folderItems = await githubApiGet<GHItem[]>(
      `/repos/${EXTERNAL_OWNER}/${EXTERNAL_REPO}/contents/${EXTERNAL_PATH}/${folder}`
    );
    const files = folderItems.filter((i) => i.type === "file");

    // 3. Read summary.json for generatedAt timestamp
    let generatedAt = folder.replace(/_(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3") + "Z";
    const summaryItem = files.find((f) => f.name === "summary.json");
    if (summaryItem?.download_url) {
      try {
        const raw = await rawFileGet(summaryItem.download_url);
        const s: ExternalSummary = JSON.parse(raw);
        if (s.generatedAt) generatedAt = s.generatedAt;
      } catch {
        // keep folder-derived timestamp
      }
    }

    // 4. Resolve commit SHA + author for this folder from the GitHub commits API
    let commit = "";
    let author = EXTERNAL_OWNER;
    try {
      type CommitItem = {
        sha: string;
        commit: { author: { name: string } };
        author: { login: string } | null;
      };
      const commits = await githubApiGet<CommitItem[]>(
        `/repos/${EXTERNAL_OWNER}/${EXTERNAL_REPO}/commits?path=${EXTERNAL_PATH}/${folder}&per_page=1`
      );
      if (Array.isArray(commits) && commits.length > 0) {
        commit = commits[0].sha ?? "";
        author =
          commits[0].author?.login ??
          commits[0].commit?.author?.name ??
          EXTERNAL_OWNER;
      }
    } catch {
      // non-critical – leave empty
    }

    // 5. Parse all *-report.json Cucumber files
    const reportItems = files.filter((f) => f.name.endsWith("-report.json"));
    if (reportItems.length === 0) {
      console.warn(`[ingest] ⚠  No *-report.json found in ${folder} – skipping.`);
      continue;
    }

    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const allDurations: number[] = [];
    const suites: SuiteSummary[] = [];
    const projectEntry: ProjectSummary = {
      name: `${EXTERNAL_OWNER}/${EXTERNAL_REPO}`,
      passed: 0, failed: 0, skipped: 0,
    };

    for (const item of reportItems) {
      if (!item.download_url) continue;
      const raw  = await rawFileGet(item.download_url);
      const features: CucumberFeature[] = JSON.parse(raw);

      for (const feature of features) {
        const suite: SuiteSummary = {
          name:       feature.name || feature.uri || item.name,
          passed: 0, failed: 0, skipped: 0, durationMs: 0,
        };

        // Skip Background hooks, only count Scenario / Scenario Outline
        const scenarios = feature.elements.filter(
          (el) => el.keyword === "Scenario" || el.keyword === "Scenario Outline"
        );

        for (const el of scenarios) {
          const status = scenarioStatus(el);
          const durMs  = elementDurationMs(el);
          allDurations.push(durMs);
          suite.durationMs += durMs;

          if (status === "passed") {
            suite.passed++;    totalPassed++;    projectEntry.passed++;
          } else if (status === "failed") {
            suite.failed++;    totalFailed++;    projectEntry.failed++;
          } else {
            suite.skipped++;   totalSkipped++;   projectEntry.skipped++;
          }
        }

        suites.push(suite);
      }
    }

    // 6. Build RunSummary
    const totalMs  = allDurations.reduce((s, d) => s + d, 0);
    const sortedD  = [...allDurations].sort((a, b) => a - b);
    const denominator = totalPassed + totalFailed || 1;
    const passRate = Math.round((totalPassed / denominator) * 1000) / 10;

    const summary: RunSummary = {
      runId:     `${SOURCE_LABEL}_${folder}`,
      timestamp: generatedAt,
      branch:    "main",
      commit,
      author,
      ciUrl: `https://github.com/${EXTERNAL_OWNER}/${EXTERNAL_REPO}/tree/main/${EXTERNAL_PATH}/${folder}`,
      source:    SOURCE_LABEL,
      totals:    { passed: totalPassed, failed: totalFailed, skipped: totalSkipped, flaky: 0 },
      durations: {
        totalMs,
        avgTestMs: allDurations.length > 0 ? Math.round(totalMs / allDurations.length) : 0,
        p95TestMs: percentile(sortedD, 95),
      },
      passRate,
      suites,
      projects: [projectEntry],
    };

    fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), "utf8");
    console.log(
      `[ingest] ✅  ${path.basename(outFile)}  ` +
      `(${totalPassed + totalFailed + totalSkipped} scenarios, passRate=${passRate}%)`
    );
    ingested++;
  }

  console.log(`[ingest] Done. New: ${ingested}  Up-to-date: ${alreadyDone}`);
}

main().catch((err) => {
  console.error("[ingest] ❌  Fatal:", err);
  process.exit(1);
});
