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

export interface RunSummary {
  runId: string;
  timestamp: string;
  branch: string;
  commit: string;
  author: string;
  ciUrl: string;
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
}

export interface IndexEntry {
  filename: string;
  timestamp: string;
  runId: string;
}
