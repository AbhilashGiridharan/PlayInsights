#!/usr/bin/env ts-node
/**
 * scripts/ingest-external.ts
 *
 * Pulls Cucumber JSON reports from AbhilashGiridharan/InsightsLogs and
 * converts them to the RunSummary format used by this dashboard, writing
 * one JSON file per run-folder into data/runs/.
 *
 * Per-scenario results come from each run's metrics.json (small, and carries
 * errors, failed steps, tags and retries). The large Cucumber *-report.json is
 * only parsed as a fallback when metrics.json is missing or has no details.
 *
 * Runs already ingested at the current SCHEMA_VERSION are skipped, so this
 * script is safe to run on every CI push (incremental / idempotent). Older
 * files are re-ingested automatically; pass --force to rebuild everything.
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

/** Bump when the RunSummary shape changes so existing files get rebuilt. */
const SCHEMA_VERSION = 3;
const FORCE          = process.argv.includes("--force");

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

// ── metrics.json types ────────────────────────────────────────────────────────

interface MetricsScenario {
  name:        string;
  feature?:    string;
  file?:       string;
  line?:       number;
  tags?:       string[];
  status:      string;
  durationMs?: number;
  retries?:    number;
  steps?:      { total: number; passed: number; failed: number; skipped: number };
  error?:      string;
  failedStep?: string;
}

interface MetricsFile {
  startedAt?:       string;
  finishedAt?:      string;
  durationMs?:      number;
  steps?:           { total: number; passed: number; failed: number; skipped: number };
  failedScenarios?: Array<{ name: string; failedStep?: string; error?: string }>;
  scenarioDetails?: MetricsScenario[];
}

// ── Output types (mirror summarize-results.ts RunSummary) ────────────────────

interface TestResult {
  name:        string;
  suite:       string;
  status:      "passed" | "failed" | "skipped";
  durationMs:  number;
  retries:     number;
  /** Number of Gherkin steps in the scenario */
  steps?:      number;
  tags:        string[];
  file?:       string;
  line?:       number;
  error?:      string;
  failedStep?: string;
}

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

interface TestTiming {
  name:       string;
  durationMs: number;
}

interface RunSummary {
  schemaVersion: number;
  runId:        string;
  timestamp:    string;
  branch:       string;
  commit:       string;
  author:       string;
  ciUrl:        string;
  source:       string;
  environment?: RunEnvironment;
  totals:       { passed: number; failed: number; skipped: number; flaky: number };
  durations:    { totalMs: number; avgTestMs: number; p95TestMs: number };
  passRate:     number;
  suites:       SuiteSummary[];
  projects:     ProjectSummary[];
  longestTest?: TestTiming;
  fastestTest?: TestTiming;
  feature?:     string;
  startedAt?:   string;
  finishedAt?:  string;
  wallClockMs?: number;
  steps?:       { total: number; passed: number; failed: number; skipped: number };
  tests:        TestResult[];
}

interface RunEnvironment {
  os?: string;
  platform?: string;
  arch?: string;
  browser?: string;
  playwright?: string;
  node?: string;
  hostname?: string;
  feature?: string;
}

interface ExternalSummary {
  timestamp:    string;
  feature:      string;
  status:       string;
  generatedAt:  string;
  environment?: RunEnvironment;
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

function normaliseStatus(status: string): TestResult["status"] {
  if (status === "passed" || status === "flaky") return "passed";
  if (status === "skipped" || status === "pending") return "skipped";
  return "failed";
}

/** Build per-scenario results from metrics.json (preferred source). */
function testsFromMetrics(m: MetricsFile): TestResult[] {
  const failedInfo = new Map((m.failedScenarios ?? []).map((f) => [f.name, f]));
  return (m.scenarioDetails ?? []).map((sc) => {
    const status = normaliseStatus(sc.status);
    const fail   = failedInfo.get(sc.name);
    return {
      name:       sc.name,
      suite:      sc.feature || "Ungrouped",
      status,
      durationMs: sc.durationMs ?? 0,
      retries:    sc.retries ?? 0,
      ...(sc.steps?.total ? { steps: sc.steps.total } : {}),
      tags:       sc.tags ?? [],
      ...(sc.file ? { file: sc.file } : {}),
      ...(sc.line ? { line: sc.line } : {}),
      ...(status === "failed"
        ? { error: sc.error ?? fail?.error, failedStep: sc.failedStep ?? fail?.failedStep }
        : {}),
    };
  });
}

/** Build per-scenario results from Cucumber JSON (fallback source). */
function testsFromCucumber(features: CucumberFeature[], fallbackSuite: string): TestResult[] {
  const out: TestResult[] = [];
  for (const feature of features) {
    // Skip Background hooks, only count Scenario / Scenario Outline
    const scenarios = feature.elements.filter(
      (el) => el.keyword === "Scenario" || el.keyword === "Scenario Outline"
    );
    for (const el of scenarios) {
      const status = scenarioStatus(el);
      const failed = el.steps.find((st) => st.result?.status === "failed");
      out.push({
        name:       el.name,
        suite:      feature.name || feature.uri || fallbackSuite,
        status,
        durationMs: elementDurationMs(el),
        retries:    0,
        steps:      el.steps.filter((st) => !st.hidden).length,
        tags:       (el.tags ?? []).map((t) => t.name),
        ...(status === "failed"
          ? {
              error:      failed?.result?.error_message,
              failedStep: failed ? `${failed.keyword.trim()} ${failed.name ?? ""}`.trim() : undefined,
            }
          : {}),
      });
    }
  }
  return out;
}

function isCurrentSchema(file: string): boolean {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).schemaVersion === SCHEMA_VERSION;
  } catch {
    return false;
  }
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

    if (!FORCE && isCurrentSchema(outFile)) {
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

    // 3. Read summary.json for generatedAt timestamp + environment
    let generatedAt = folder.replace(/_(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3") + "Z";
    let environment: RunEnvironment | undefined;
    const summaryItem = files.find((f) => f.name === "summary.json");
    if (summaryItem?.download_url) {
      try {
        const raw = await rawFileGet(summaryItem.download_url);
        const s: ExternalSummary = JSON.parse(raw);
        if (s.generatedAt) generatedAt = s.generatedAt;
        if (s.environment) environment = s.environment;
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

    // 5. Per-scenario results: metrics.json first, Cucumber reports as fallback
    let tests: TestResult[] = [];
    let metrics: MetricsFile | undefined;
    const metricsItem = files.find((f) => f.name === "metrics.json");
    if (metricsItem?.download_url) {
      try {
        metrics = JSON.parse(await rawFileGet(metricsItem.download_url)) as MetricsFile;
        tests = testsFromMetrics(metrics);
      } catch {
        console.warn(`[ingest] ⚠  Failed to parse metrics.json in ${folder} – trying reports.`);
      }
    }

    if (tests.length === 0) {
      const reportItems = files.filter((f) => f.name.endsWith("-report.json"));
      for (const item of reportItems) {
        if (!item.download_url) continue;
        try {
          const features = JSON.parse(await rawFileGet(item.download_url)) as CucumberFeature[];
          tests.push(...testsFromCucumber(features, item.name));
        } catch {
          console.warn(
            `[ingest] ⚠  Failed to parse report file ${item.name} in ${folder} – skipping file.`
          );
        }
      }
    }

    if (tests.length === 0) {
      console.warn(`[ingest] ⚠  No scenario results found in ${folder} – skipping folder.`);
      continue;
    }

    // 6. Aggregate into suites / totals
    const suiteMap = new Map<string, SuiteSummary>();
    const count = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
    for (const t of tests) {
      const suite = suiteMap.get(t.suite) ??
        { name: t.suite, passed: 0, failed: 0, skipped: 0, durationMs: 0 };
      suite[t.status]++;
      suite.durationMs += t.durationMs;
      suiteMap.set(t.suite, suite);
      count[t.status]++;
      if (t.status === "passed" && t.retries > 0) count.flaky++;
    }
    const suites = [...suiteMap.values()];
    const projectEntry: ProjectSummary = {
      name: `${EXTERNAL_OWNER}/${EXTERNAL_REPO}`,
      passed: count.passed, failed: count.failed, skipped: count.skipped,
    };

    const allDurations = tests.map((t) => t.durationMs);
    const totalMs  = allDurations.reduce((s, d) => s + d, 0);
    const sortedD  = [...allDurations].sort((a, b) => a - b);
    const denominator = count.passed + count.failed || 1;
    const passRate = Math.round((count.passed / denominator) * 1000) / 10;

    const timing = (t: TestResult): TestTiming => ({ name: t.name, durationMs: t.durationMs });
    const longestTest = timing(tests.reduce((a, b) => (b.durationMs > a.durationMs ? b : a)));
    const fastestTest = timing(tests.reduce((a, b) => (b.durationMs < a.durationMs ? b : a)));

    const summary: RunSummary = {
      schemaVersion: SCHEMA_VERSION,
      runId:     `${SOURCE_LABEL}_${folder}`,
      timestamp: generatedAt,
      branch:    "main",
      commit,
      author,
      ciUrl: `https://github.com/${EXTERNAL_OWNER}/${EXTERNAL_REPO}/tree/main/${EXTERNAL_PATH}/${folder}`,
      source:    SOURCE_LABEL,
      ...(environment ? { environment } : {}),
      totals:    count,
      durations: {
        totalMs,
        avgTestMs: allDurations.length > 0 ? Math.round(totalMs / allDurations.length) : 0,
        p95TestMs: percentile(sortedD, 95),
      },
      passRate,
      suites,
      projects: [projectEntry],
      longestTest,
      fastestTest,
      ...(environment?.feature ? { feature: environment.feature } : {}),
      ...(metrics?.startedAt   ? { startedAt: metrics.startedAt } : {}),
      ...(metrics?.finishedAt  ? { finishedAt: metrics.finishedAt } : {}),
      ...(metrics?.durationMs  ? { wallClockMs: metrics.durationMs } : {}),
      ...(metrics?.steps       ? { steps: metrics.steps } : {}),
      tests,
    };

    fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), "utf8");
    console.log(
      `[ingest] ✅  ${path.basename(outFile)}  ` +
      `(${tests.length} scenarios, passRate=${passRate}%)`
    );
    ingested++;
  }

  console.log(`[ingest] Done. New: ${ingested}  Up-to-date: ${alreadyDone}`);
}

main().catch((err) => {
  console.error("[ingest] ❌  Fatal:", err);
  process.exit(1);
});
