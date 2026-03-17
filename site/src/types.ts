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

export interface RunEnvironment {
  os?: string;
  platform?: string;
  arch?: string;
  browser?: string;
  playwright?: string;
  node?: string;
  hostname?: string;
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
}

export interface IndexEntry {
  filename: string;
  timestamp: string;
  runId: string;
}
