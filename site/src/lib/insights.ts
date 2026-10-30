/**
 * site/src/lib/insights.ts
 *
 * Pure helpers that turn RunSummary data into report-level insights:
 * formatting, failure classification, story/priority grouping, verdicts.
 */

import type { RunSummary, TestResult } from "../types";

// ── Formatting ───────────────────────────────────────────────────────────────

export function fmtDuration(ms: number): string {
  if (ms < 1_000)     return `${Math.round(ms)}ms`;
  if (ms < 60_000)    return `${(ms / 1_000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1_000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export function fmtRunLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function fmtRunDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function humanize(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function passRateTone(rate: number): "good" | "warn" | "bad" {
  return rate >= 95 ? "good" : rate >= 75 ? "warn" : "bad";
}

export function totalTests(run: RunSummary): number {
  return run.totals.passed + run.totals.failed + run.totals.skipped;
}

// ── Run ordering ─────────────────────────────────────────────────────────────

/** The run executed immediately before `run`, or null. `runs` is newest-first. */
export function previousRun(runs: RunSummary[], run: RunSummary): RunSummary | null {
  const t = new Date(run.timestamp).getTime();
  return runs.find((r) => new Date(r.timestamp).getTime() < t) ?? null;
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export function priorityOf(t: TestResult): "P1" | "P2" | "P3" | null {
  const tag = t.tags.find((x) => /^@P[1-3]$/i.test(x));
  return tag ? (tag.slice(1).toUpperCase() as "P1" | "P2" | "P3") : null;
}

const TYPE_TAGS = ["smoke", "regression", "e2e", "positive", "negative", "boundary"] as const;
export type TestType = (typeof TYPE_TAGS)[number];

export function typesOf(t: TestResult): TestType[] {
  return TYPE_TAGS.filter((k) => t.tags.includes(`@${k}`));
}

export function acceptanceCriteriaOf(t: TestResult): string[] {
  return t.tags.filter((x) => x.startsWith("@AC-")).map((x) => x.slice(1));
}

export function isPossibleDefect(t: TestResult): boolean {
  return t.tags.includes("@possible-defect");
}

// ── User stories ─────────────────────────────────────────────────────────────

/** "US-02 Create a New Job Risk Assessment" → { id: "US-02", title: "Create a New…" } */
export function splitStory(name: string): { id: string | null; title: string } {
  const m = name.match(/^(US-\d+[a-z]?)\s+(.*)$/i);
  return m ? { id: m[1].toUpperCase(), title: m[2] } : { id: null, title: name };
}

/** "SC-02.06 Saving an empty…" → { id: "SC-02.06", title: "Saving an empty…" } */
export function splitScenario(name: string): { id: string | null; title: string } {
  const m = name.match(/^(SC-[\d.]+)\s+(.*)$/i);
  return m ? { id: m[1].toUpperCase(), title: m[2] } : { id: null, title: name };
}

export interface StoryStats {
  name: string;
  id: string | null;
  title: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  tests: TestResult[];
  criteria: Set<string>;
}

export function storiesOf(run: RunSummary): StoryStats[] {
  const map = new Map<string, StoryStats>();
  const tests = run.tests ?? [];
  // Fall back to suite aggregates for runs ingested before per-test data existed
  if (tests.length === 0) {
    return run.suites.map((s) => ({
      ...splitStory(s.name), name: s.name,
      passed: s.passed, failed: s.failed, skipped: s.skipped,
      durationMs: s.durationMs, tests: [], criteria: new Set(),
    }));
  }
  for (const t of tests) {
    const s = map.get(t.suite) ?? {
      ...splitStory(t.suite), name: t.suite,
      passed: 0, failed: 0, skipped: 0, durationMs: 0, tests: [], criteria: new Set<string>(),
    };
    s[t.status]++;
    s.durationMs += t.durationMs;
    s.tests.push(t);
    acceptanceCriteriaOf(t).forEach((c) => s.criteria.add(c));
    map.set(t.suite, s);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function criteriaCoverage(run: RunSummary): { total: number; verified: number } {
  const all = new Set<string>();
  const failing = new Set<string>();
  for (const t of run.tests ?? []) {
    for (const c of acceptanceCriteriaOf(t)) {
      all.add(c);
      if (t.status !== "passed") failing.add(c);
    }
  }
  return { total: all.size, verified: all.size - failing.size };
}

// ── Failure classification ───────────────────────────────────────────────────

export interface FailureCategory {
  key: string;
  label: string;
  description: string;
  improvement: { title: string; description: string; effort: "Low" | "Medium" | "High" };
}

const CATEGORIES: Array<FailureCategory & { match: (t: TestResult) => boolean }> = [
  {
    key: "defect",
    label: "Possible product defect",
    description:
      "The scenario is tagged @possible-defect: the application behaved differently from the acceptance criterion, so this is likely a product issue rather than a test issue.",
    improvement: {
      title: "Raise and track product defects for @possible-defect failures",
      description: "Log each possible-defect failure with the expected/received values from the run so development can confirm or reject it, then link the defect ID back to the scenario.",
      effort: "Low",
    },
    match: isPossibleDefect,
  },
  {
    key: "timeout",
    label: "Timeout / synchronisation",
    description:
      "An element or page did not reach the expected state within the time limit. Typical causes are slow environment responses, a preceding step failing silently, or waits that do not target the right condition.",
    improvement: {
      title: "Stabilise waits around slow pages",
      description: "Replace fixed waits with web-first assertions (toBeVisible / toHaveURL) on the specific element the next step needs, and review timeouts for steps that depend on back-end processing.",
      effort: "Medium",
    },
    match: (t) => /TimeoutError|Timeout \d+ms exceeded/i.test(t.error ?? ""),
  },
  {
    key: "network",
    label: "Network / API",
    description:
      "A request or file transfer failed while the scenario was running, pointing to environment or service instability rather than UI behaviour.",
    improvement: {
      title: "Add retries and health checks for API-dependent steps",
      description: "Check environment health before the run and wrap file/API transfers in a bounded retry so transient service issues do not fail functional scenarios.",
      effort: "Medium",
    },
    match: (t) => /apiRequestContext|ECONNRESET|net::|socket|stream/i.test(t.error ?? ""),
  },
  {
    key: "navigation",
    label: "Navigation / URL",
    description: "The browser did not land on the expected page after an action, so the flow could not continue.",
    improvement: {
      title: "Assert navigation explicitly after save actions",
      description: "After actions that redirect, wait for the target URL pattern before interacting with the next page.",
      effort: "Low",
    },
    match: (t) => /toHaveURL/i.test(t.error ?? ""),
  },
  {
    key: "ui",
    label: "UI element not as expected",
    description:
      "An expected element was missing, hidden, or showed different text. This can come from a UI change, missing permissions for the user profile, or data from an earlier step.",
    improvement: {
      title: "Review locators and test data for UI assertions",
      description: "Prefer role- and label-based locators, and confirm the user profile has access to the element under test.",
      effort: "Low",
    },
    match: (t) => /toBeVisible|toHaveText|locator/i.test(t.error ?? ""),
  },
  {
    key: "assertion",
    label: "Assertion mismatch",
    description: "The application returned a value different from the one the acceptance criterion expects.",
    improvement: {
      title: "Confirm expected values with the product owner",
      description: "For each value mismatch, confirm whether the expectation or the application is correct and update the scenario or raise a defect.",
      effort: "Low",
    },
    match: (t) => /expect\(|Expected/i.test(t.error ?? ""),
  },
];

const OTHER: FailureCategory = {
  key: "other",
  label: "Other",
  description: "The failure did not match a known pattern; see the error message for details.",
  improvement: {
    title: "Triage unclassified failures",
    description: "Review the error output and screenshots for these scenarios and add a clearer assertion message.",
    effort: "Low",
  },
};

export function categorize(t: TestResult): FailureCategory {
  return CATEGORIES.find((c) => c.match(t)) ?? OTHER;
}

/** First meaningful line of an error, without ANSI codes. */
export function errorHeadline(error?: string): string {
  if (!error) return "No error message recorded";
  const clean = error.replace(/\u001b\[[0-9;]*m/g, "");
  return clean.split("\n").map((l) => l.trim()).find(Boolean) ?? clean;
}

/** Pull Expected / Received values out of a Playwright assertion message. */
export function expectedReceived(error?: string): { expected: string; received: string } {
  const clean = (error ?? "").replace(/\u001b\[[0-9;]*m/g, "");
  const exp = clean.match(/Expected(?: substring| pattern| string)?:\s*(.+)/i)?.[1]?.trim();
  const rec = clean.match(/Received(?: string| value)?:\s*(.+)/i)?.[1]?.trim();
  return { expected: exp ?? "—", received: rec ?? "—" };
}

// ── Verdict ──────────────────────────────────────────────────────────────────

export interface Verdict {
  tone: "good" | "warn" | "bad";
  title: string;
  detail: string;
}

export function verdictOf(run: RunSummary): Verdict {
  const total = totalTests(run);
  const failedTests = (run.tests ?? []).filter((t) => t.status === "failed");
  const p1Failed = failedTests.filter((t) => priorityOf(t) === "P1").length;
  if (run.totals.failed === 0) {
    return { tone: "good", title: "Ready for release", detail: `All ${total} automated scenarios passed.` };
  }
  if (run.passRate >= 85 && p1Failed === 0) {
    return {
      tone: "warn",
      title: "Release with caution",
      detail: `${run.totals.failed} of ${total} scenarios failed, none of them priority P1.`,
    };
  }
  return {
    tone: "bad",
    title: "Not ready for release",
    detail: `${run.totals.failed} of ${total} scenarios failed${p1Failed ? `, including ${p1Failed} priority P1` : ""}.`,
  };
}

// ── Run-to-run comparison ────────────────────────────────────────────────────

export interface RunDiff {
  /** Failed now, but passed (or did not run) in the previous run */
  newFailures: TestResult[];
  /** Failed in the previous run, passed now */
  fixed: TestResult[];
  /** Failed in both runs */
  persistent: TestResult[];
}

export function diffRuns(prev: RunSummary | null, cur: RunSummary): RunDiff {
  const curTests = cur.tests ?? [];
  const prevStatus = new Map((prev?.tests ?? []).map((t) => [t.name, t.status]));
  const failed = curTests.filter((t) => t.status === "failed");
  return {
    newFailures: failed.filter((t) => prevStatus.get(t.name) !== "failed"),
    persistent:  failed.filter((t) => prevStatus.get(t.name) === "failed"),
    fixed:       curTests.filter((t) => t.status === "passed" && prevStatus.get(t.name) === "failed"),
  };
}

/** How many of the most recent runs (up to and including `run`) this test failed in a row. */
export function failStreak(runs: RunSummary[], run: RunSummary, testName: string): number {
  const t0 = new Date(run.timestamp).getTime();
  let streak = 0;
  for (const r of runs.filter((x) => new Date(x.timestamp).getTime() <= t0)) {
    const t = r.tests?.find((x) => x.name === testName);
    if (!t) continue;
    if (t.status !== "failed") break;
    streak++;
  }
  return streak;
}

// ── History aggregate ────────────────────────────────────────────────────────

export const ALL_RUNS_ID = "__all_runs__";

/**
 * Combine every run into one synthetic RunSummary so the report components
 * can show overall execution. `tests` holds every execution, newest first.
 */
export function aggregateRuns(runs: RunSummary[]): RunSummary {
  const newest = runs[0];
  const oldest = runs[runs.length - 1];
  const sum = (f: (r: RunSummary) => number) => runs.reduce((s, r) => s + f(r), 0);
  const totals = {
    passed:  sum((r) => r.totals.passed),
    failed:  sum((r) => r.totals.failed),
    skipped: sum((r) => r.totals.skipped),
    flaky:   sum((r) => r.totals.flaky),
  };
  const tests = runs.flatMap((r) => r.tests ?? []);
  const durs = tests.map((t) => t.durationMs).sort((a, b) => a - b);
  const totalMs = sum((r) => r.durations.totalMs);
  const executions = totals.passed + totals.failed + totals.skipped;

  const suites = new Map<string, RunSummary["suites"][number]>();
  for (const r of runs) {
    for (const s of r.suites) {
      const acc = suites.get(s.name) ?? { name: s.name, passed: 0, failed: 0, skipped: 0, durationMs: 0 };
      acc.passed += s.passed; acc.failed += s.failed; acc.skipped += s.skipped; acc.durationMs += s.durationMs;
      suites.set(s.name, acc);
    }
  }
  const withSteps = runs.filter((r) => r.steps);

  return {
    runId: ALL_RUNS_ID,
    timestamp: newest.timestamp,
    startedAt: oldest.startedAt ?? oldest.timestamp,
    branch: newest.branch,
    commit: "",
    author: "",
    ciUrl: "",
    environment: newest.environment,
    feature: newest.feature,
    totals,
    durations: {
      totalMs,
      avgTestMs: executions ? Math.round(totalMs / executions) : 0,
      p95TestMs: durs.length ? durs[Math.max(0, Math.ceil(0.95 * durs.length) - 1)] : 0,
    },
    passRate: totals.passed + totals.failed
      ? Math.round((totals.passed / (totals.passed + totals.failed)) * 1000) / 10
      : 0,
    suites: [...suites.values()],
    projects: newest.projects,
    wallClockMs: sum((r) => r.wallClockMs ?? r.durations.totalMs),
    ...(withSteps.length
      ? {
          steps: withSteps.reduce(
            (a, r) => ({
              total: a.total + r.steps!.total, passed: a.passed + r.steps!.passed,
              failed: a.failed + r.steps!.failed, skipped: a.skipped + r.steps!.skipped,
            }),
            { total: 0, passed: 0, failed: 0, skipped: 0 }
          ),
        }
      : {}),
    tests,
    aggregateOf: runs.length,
  };
}

/** Group executions by scenario name (first entry per group = most recent). */
export function groupByScenario(tests: TestResult[]): Array<{ name: string; runs: TestResult[] }> {
  const map = new Map<string, TestResult[]>();
  for (const t of tests) map.set(t.name, [...(map.get(t.name) ?? []), t]);
  return [...map.entries()].map(([name, runs]) => ({ name, runs }));
}

/**
 * Fixed colour per failure cause, so a cause keeps its colour across runs and
 * views. Slots come from the validated categorical palette (--cat-n tokens);
 * unknown causes (e.g. from analysis.json) fall back by position.
 */
const CATEGORY_SLOTS: Record<string, number> = {
  defect: 1, timeout: 2, ui: 3, assertion: 4, navigation: 5, network: 6,
};

export function categoryColor(label: string, fallbackIndex = 0): string {
  const key = [...CATEGORIES, OTHER].find((c) => c.label === label)?.key;
  if (key === "other") return "var(--status-skip)";
  const slot = key ? CATEGORY_SLOTS[key] : (fallbackIndex % 6) + 1;
  return `var(--cat-${slot})`;
}

// ── Automation effort / ROI ──────────────────────────────────────────────────

export interface Effort {
  /** Passed scenarios counted */
  scenarios: number;
  /** Gherkin steps in those scenarios */
  steps: number;
  /** Estimated time to execute them by hand */
  manualMs: number;
  /** Time automation spent on them */
  automatedMs: number;
  savedMs: number;
  savingsUSD: number;
}

/**
 * Effort saved by one run (or the aggregate): steps of passed scenarios ×
 * MANUAL_MINS_PER_STEP, minus the automated time of those same scenarios.
 */
export function effortOf(
  run: RunSummary,
  cfg: { minsPerStep: number; fallbackMinsPerScenario: number; hourlyRate: number }
): Effort {
  const passed = (run.tests ?? []).filter((t) => t.status === "passed");
  let steps = 0;
  let manualMins = 0;
  let automatedMs = 0;
  for (const t of passed) {
    if (t.steps) {
      steps += t.steps;
      manualMins += t.steps * cfg.minsPerStep;
    } else {
      manualMins += cfg.fallbackMinsPerScenario;
    }
    automatedMs += t.durationMs;
  }
  // Runs recorded before per-scenario data: estimate from totals
  if (!run.tests?.length) {
    manualMins = run.totals.passed * cfg.fallbackMinsPerScenario;
    automatedMs = run.durations.avgTestMs * run.totals.passed;
  }
  const manualMs = manualMins * 60_000;
  const savedMs = Math.max(0, manualMs - automatedMs);
  return {
    scenarios: run.tests?.length ? passed.length : run.totals.passed,
    steps, manualMs, automatedMs, savedMs,
    savingsUSD: (savedMs / 3_600_000) * cfg.hourlyRate,
  };
}

export function fmtUSD(dollars: number): string {
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}
