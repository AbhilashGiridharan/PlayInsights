/**
 * site/src/types.ts
 * Shared TypeScript types matching the JSON schema produced by summarize-results.ts
 */

export interface SuiteSummary {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export interface ProjectSummary {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
}

export interface TestTiming {
  name:       string;
  durationMs: number;
}

export interface TestResult {
  name:        string;
  /** User story / feature the scenario belongs to */
  suite:       string;
  status:      "passed" | "failed" | "skipped";
  durationMs:  number;
  retries:     number;
  /** Number of Gherkin steps in the scenario */
  steps?:      number;
  /** Cucumber tags, e.g. @P1, @smoke, @AC-01.2, @possible-defect */
  tags:        string[];
  file?:       string;
  line?:       number;
  error?:      string;
  failedStep?: string;
}

export interface StepTotals {
  total:   number;
  passed:  number;
  failed:  number;
  skipped: number;
}

export interface RunEnvironment {
  os?: string;
  platform?: string;
  arch?: string;
  browser?: string;
  playwright?: string;
  node?: string;
  hostname?: string;
  feature?: string;
}

export interface RunSummary {
  runId: string;
  timestamp: string;
  branch: string;
  commit: string;
  author: string;
  ciUrl: string;
  /** Origin repo – e.g. "InsightsLogs" for external runs, absent for local Playwright runs */
  source?: string;
  environment?: RunEnvironment;
  totals: {
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
  };
  durations: {
    totalMs: number;
    avgTestMs: number;
    p95TestMs: number;
  };
  passRate: number;
  suites: SuiteSummary[];
  projects: ProjectSummary[];
  longestTest?: TestTiming;
  fastestTest?: TestTiming;
  /** Present on runs ingested at schemaVersion >= 2 */
  feature?: string;
  startedAt?: string;
  finishedAt?: string;
  wallClockMs?: number;
  steps?: StepTotals;
  tests?: TestResult[];
  /** Set on the synthetic "all runs" summary: how many runs it combines */
  aggregateOf?: number;
}

export interface IndexEntry {
  filename: string;
  timestamp: string;
  runId: string;
}
