#!/usr/bin/env ts-node
/**
 * scripts/summarize-results.ts
 *
 * Reads playwright-report/results.json (Playwright JSON reporter output) and
 * writes two files:
 *   - data/runs/<timestamp>.json   (detailed run summary)
 *   - data/last.json               (copy of the most recent summary)
 *
 * Environment variables consumed (all optional – fall back to sensible defaults):
 *   GITHUB_SHA            full commit SHA
 *   GITHUB_REF_NAME       branch / tag name
 *   GITHUB_RUN_ID         Actions run ID
 *   GITHUB_SERVER_URL     e.g. https://github.com
 *   GITHUB_REPOSITORY     e.g. owner/repo
 */

import * as fs from "fs";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────────────────────
// Playwright JSON reporter structure (v1.40+):
//   report → suites (projects) → suites (files) → specs (test titles) → tests (per-project) → results (per-retry)

interface PWTestResult {
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  duration: number;
  retry: number;
}

interface PWTest {
  /** "expected" | "unexpected" | "flaky" | "skipped" */
  status: string;
  expectedStatus: string;
  results: PWTestResult[];
}

interface PWSpec {
  title: string;
  ok: boolean;
  tests: PWTest[];
}

interface PWSuite {
  title: string;
  file?: string;
  suites?: PWSuite[];
  specs?: PWSpec[];
}

interface PWReport {
  suites: PWSuite[];
  stats?: {
    startTime?: string;
    duration?: number;
  };
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

interface RunSummary {
  runId: string;
  timestamp: string;
  branch: string;
  commit: string;
  author: string;
  ciUrl: string;
  totals: { passed: number; failed: number; skipped: number; flaky: number };
  durations: { totalMs: number; avgTestMs: number; p95TestMs: number };
  passRate: number;
  suites: SuiteSummary[];
  projects: ProjectSummary[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** Flatten all spec nodes from a (possibly nested) suite tree. */
function collectTests(suite: PWSuite): PWSpec[] {
  const specs: PWSpec[] = [];
  if (suite.specs) specs.push(...suite.specs);
  if (suite.suites) {
    for (const child of suite.suites) {
      specs.push(...collectTests(child));
    }
  }
  return specs;
}

/** A spec is flaky when Playwright marks any of its per-project tests as "flaky". */
function isFlaky(spec: PWSpec): boolean {
  return spec.tests.some((t) => t.status === "flaky");
}

/** Determine the final status of a spec. */
function finalStatus(
  spec: PWSpec
): "passed" | "failed" | "skipped" | "flaky" {
  if (isFlaky(spec)) return "flaky";
  if (spec.ok) return "passed";
  // If every result in every test attempt is skipped, call it skipped
  const allResults = spec.tests.flatMap((t) => t.results);
  if (allResults.length === 0) return "skipped";
  if (allResults.every((r) => r.status === "skipped")) return "skipped";
  return "failed";
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const reportFile = path.join(repoRoot, "playwright-report", "results.json");

  if (!fs.existsSync(reportFile)) {
    console.error(`[summarize] ❌  Report not found: ${reportFile}`);
    console.error(
      "[summarize]    Run `npx playwright test` first to generate it."
    );
    process.exit(1);
  }

  const raw: PWReport = JSON.parse(fs.readFileSync(reportFile, "utf8"));

  // ── CI metadata ─────────────────────────────────────────────────────────────
  const sha = process.env.GITHUB_SHA ?? "local";
  const shortSha = sha.slice(0, 8);
  const branch = process.env.GITHUB_REF_NAME ?? "local";
  const runId = process.env.GITHUB_RUN_ID ?? "0";
  const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repository = process.env.GITHUB_REPOSITORY ?? "owner/repo";
  const author =
    process.env.GITHUB_ACTOR ?? process.env.USER ?? "unknown";

  const ciUrl =
    runId !== "0"
      ? `${serverUrl}/${repository}/actions/runs/${runId}`
      : "";

  const now = new Date();
  const timestamp = now.toISOString();
  // File-system-safe timestamp: 2024-05-01_12-30-00
  const fileTs = timestamp
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);

  const summaryRunId = `${shortSha}_${fileTs}`;

  // ── Aggregate totals ─────────────────────────────────────────────────────────
  // Playwright JSON top-level suites are the project-level suites.
  // Structure: project → file → describe → test

  let passed = 0,
    failed = 0,
    skipped = 0,
    flaky = 0;
  const allDurations: number[] = [];

  const projectMap: Map<string, ProjectSummary> = new Map();
  const suiteMap: Map<string, SuiteSummary> = new Map();

  for (const projectSuite of raw.suites ?? []) {
    const projectName = projectSuite.title;

    if (!projectMap.has(projectName)) {
      projectMap.set(projectName, {
        name: projectName,
        passed: 0,
        failed: 0,
        skipped: 0,
      });
    }
    const proj = projectMap.get(projectName)!;

    // File-level suites within each project
    for (const fileSuite of projectSuite.suites ?? []) {
      const suiteName = fileSuite.title; // e.g. "tests/example.spec.ts"

      if (!suiteMap.has(suiteName)) {
        suiteMap.set(suiteName, {
          name: suiteName,
          passed: 0,
          failed: 0,
          skipped: 0,
          durationMs: 0,
        });
      }
      const suite = suiteMap.get(suiteName)!;

      const tests = collectTests(fileSuite);
      for (const t of tests) {
        const status = finalStatus(t);
        // Sum durations across all tests (per-project runs) and their retries
        const duration = t.tests.reduce(
          (sum: number, test) =>
            sum + test.results.reduce((s: number, r) => s + (r.duration ?? 0), 0),
          0
        );
        allDurations.push(duration);
        suite.durationMs += duration;

        switch (status) {
          case "passed":
            passed++;
            proj.passed++;
            suite.passed++;
            break;
          case "failed":
            failed++;
            proj.failed++;
            suite.failed++;
            break;
          case "skipped":
            skipped++;
            proj.skipped++;
            suite.skipped++;
            break;
          case "flaky":
            flaky++;
            proj.passed++; // flaky ultimately passed
            suite.passed++;
            passed++;
            break;
        }
      }
    }
  }

  const sortedDurations = [...allDurations].sort((a, b) => a - b);
  const totalMs = allDurations.reduce((s, d) => s + d, 0);
  const total = passed + failed + skipped;
  const passRate = total > 0 ? Math.round((passed / (total - skipped || 1)) * 1000) / 10 : 100;

  const summary: RunSummary = {
    runId: summaryRunId,
    timestamp,
    branch,
    commit: sha,
    author,
    ciUrl,
    totals: { passed, failed, skipped, flaky },
    durations: {
      totalMs,
      avgTestMs:
        allDurations.length > 0
          ? Math.round(totalMs / allDurations.length)
          : 0,
      p95TestMs: percentile(sortedDurations, 95),
    },
    passRate,
    suites: Array.from(suiteMap.values()),
    projects: Array.from(projectMap.values()),
  };

  // ── Write files ──────────────────────────────────────────────────────────────
  const dataRunsDir = path.join(repoRoot, "data", "runs");
  ensureDir(dataRunsDir);

  const runFile = path.join(dataRunsDir, `${fileTs}.json`);
  fs.writeFileSync(runFile, JSON.stringify(summary, null, 2), "utf8");
  console.log(`[summarize] ✅  Wrote ${path.relative(repoRoot, runFile)}`);

  const lastFile = path.join(repoRoot, "data", "last.json");
  fs.writeFileSync(lastFile, JSON.stringify(summary, null, 2), "utf8");
  console.log(`[summarize] ✅  Wrote ${path.relative(repoRoot, lastFile)}`);
}

main();
