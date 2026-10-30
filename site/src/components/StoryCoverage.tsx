/**
 * StoryCoverage.tsx
 *
 * Requirement-level view of the selected run: one row per user story with a
 * pass/fail split (expandable to its scenarios), plus breakdowns by priority
 * and by test type.
 */

import { useState } from "react";
import type { RunSummary, TestResult } from "../types";
import {
  acceptanceCriteriaOf, fmtDuration, groupByScenario, priorityOf, splitScenario, storiesOf, typesOf,
  type TestType,
} from "../lib/insights";

interface Props { run: RunSummary }

function SplitBar({ passed, failed, skipped }: { passed: number; failed: number; skipped: number }) {
  const total = passed + failed + skipped || 1;
  return (
    <div className="split-bar" role="img" aria-label={`${passed} passed, ${failed} failed, ${skipped} skipped`}>
      {passed  > 0 && <span className="seg seg-pass" style={{ width: `${(passed / total) * 100}%` }} />}
      {failed  > 0 && <span className="seg seg-fail" style={{ width: `${(failed / total) * 100}%` }} />}
      {skipped > 0 && <span className="seg seg-skip" style={{ width: `${(skipped / total) * 100}%` }} />}
    </div>
  );
}

function StatusPill({ status }: { status: TestResult["status"] | "partial" }) {
  const map = {
    passed:  ["status-pass", "✓ Passed"],
    failed:  ["status-fail", "✕ Failed"],
    skipped: ["status-skip", "– Skipped"],
    partial: ["status-fail", "✕ Failing"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

interface Group { key: string; label: string; passed: number; total: number }

function BreakdownCard({ title, groups, empty, meta }: { title: string; groups: Group[]; empty: string; meta?: string }) {
  return (
    <div className="panel breakdown">
      <div className="panel-head"><h3>{title}</h3>{meta && <span className="panel-meta">{meta}</span>}</div>
      {groups.length === 0 ? (
        <div className="panel-empty">{empty}</div>
      ) : (
        <div className="breakdown-rows">
          {groups.map((g) => {
            const pct = g.total ? (g.passed / g.total) * 100 : 0;
            return (
              <div key={g.key} className="breakdown-row">
                <span className="breakdown-label">{g.label}</span>
                <div className="breakdown-track">
                  <span className="breakdown-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="breakdown-value">
                  {g.passed}/{g.total} <small>{Math.round(pct)}%</small>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TYPE_LABELS: Record<TestType, string> = {
  smoke: "Smoke", regression: "Regression", e2e: "End-to-end",
  positive: "Positive path", negative: "Negative path", boundary: "Boundary",
};

/** Pass record of one scenario across runs, e.g. "4/6 runs". */
function RecordPill({ passed, ran }: { passed: number; ran: number }) {
  const cls = passed === ran ? "status-pass" : passed === 0 ? "status-fail" : "status-warn";
  return <span className={`status-pill ${cls}`}>{passed}/{ran} runs</span>;
}

export function StoryCoverage({ run }: Props) {
  const isAll = Boolean(run.aggregateOf);
  const stories = storiesOf(run);
  const [open, setOpen] = useState<string | null>(null);
  const tests = run.tests ?? [];

  const byPriority: Group[] = (["P1", "P2", "P3"] as const)
    .map((p) => {
      const ts = tests.filter((t) => priorityOf(t) === p);
      return { key: p, label: `${p} ${p === "P1" ? "· Critical" : p === "P2" ? "· High" : "· Normal"}`, passed: ts.filter((t) => t.status === "passed").length, total: ts.length };
    })
    .filter((g) => g.total > 0);

  const byType: Group[] = (Object.keys(TYPE_LABELS) as TestType[])
    .map((k) => {
      const ts = tests.filter((t) => typesOf(t).includes(k));
      return { key: k, label: TYPE_LABELS[k], passed: ts.filter((t) => t.status === "passed").length, total: ts.length };
    })
    .filter((g) => g.total > 0);

  return (
    <div className="coverage-layout">
      <div className="panel">
        <div className="panel-head">
          <h3>User story coverage</h3>
          <span className="panel-meta">
            {stories.length} stories{isAll ? ` · executions across ${run.aggregateOf} runs` : ""} · click a story to see its scenarios
          </span>
        </div>
        <div className="story-table" role="table">
          <div className="story-row story-row-head" role="row">
            <span role="columnheader">Story</span>
            <span role="columnheader">{isAll ? "Executions" : "Scenarios"}</span>
            <span role="columnheader" className="hide-sm">Result split</span>
            <span role="columnheader" className="hide-sm">Duration</span>
            <span role="columnheader">Status</span>
          </div>
          {stories.map((s) => {
            const total = s.passed + s.failed + s.skipped;
            const isOpen = open === s.name;
            return (
              <div key={s.name} className={`story-group${isOpen ? " open" : ""}`}>
                <div
                  className="story-row" role="row" tabIndex={s.tests.length ? 0 : -1}
                  aria-expanded={s.tests.length ? isOpen : undefined}
                  onClick={() => s.tests.length && setOpen(isOpen ? null : s.name)}
                  onKeyDown={(e) => e.key === "Enter" && s.tests.length && setOpen(isOpen ? null : s.name)}
                >
                  <span className="story-name" role="cell">
                    {s.tests.length > 0 && <span className="story-caret" aria-hidden="true">▸</span>}
                    {s.id && <span className="story-id">{s.id}</span>}
                    <span className="story-title" title={s.title}>{s.title}</span>
                  </span>
                  <span role="cell" className="num">
                    {s.passed}/{total}
                    {s.criteria.size > 0 && <small className="muted"> · {s.criteria.size} AC</small>}
                  </span>
                  <span role="cell" className="hide-sm"><SplitBar {...s} /></span>
                  <span role="cell" className="num hide-sm">{fmtDuration(s.durationMs)}</span>
                  <span role="cell">
                    {isAll && s.failed > 0
                      ? <span className="status-pill status-warn">{Math.round((s.passed / Math.max(1, s.passed + s.failed)) * 100)}% pass</span>
                      : <StatusPill status={s.failed > 0 ? "partial" : s.passed > 0 ? "passed" : "skipped"} />}
                  </span>
                </div>
                {isOpen && (
                  <div className="story-scenarios">
                    {isAll
                      ? groupByScenario(s.tests).map(({ name, runs }) => {
                          const t = runs[0];
                          const sc = splitScenario(name);
                          const pri = priorityOf(t);
                          const passed = runs.filter((r) => r.status === "passed").length;
                          const avg = runs.reduce((a, r) => a + r.durationMs, 0) / runs.length;
                          return (
                            <div key={name} className="scenario-row">
                              <span className={`scenario-dot ${t.status}`} aria-hidden="true" title={`Latest: ${t.status}`} />
                              {sc.id && <span className="scenario-id">{sc.id}</span>}
                              <span className="scenario-title" title={name}>{sc.title}</span>
                              {pri && <span className={`tag tag-${pri.toLowerCase()}`}>{pri}</span>}
                              <span className="scenario-ac hide-sm">{acceptanceCriteriaOf(t).join(", ")}</span>
                              <span className="num muted" title="Average duration">{fmtDuration(avg)}</span>
                              <RecordPill passed={passed} ran={runs.length} />
                            </div>
                          );
                        })
                      : s.tests.map((t) => {
                          const sc = splitScenario(t.name);
                          const pri = priorityOf(t);
                          return (
                            <div key={t.name} className="scenario-row">
                              <span className={`scenario-dot ${t.status}`} aria-hidden="true" />
                              {sc.id && <span className="scenario-id">{sc.id}</span>}
                              <span className="scenario-title" title={t.name}>{sc.title}</span>
                              {pri && <span className={`tag tag-${pri.toLowerCase()}`}>{pri}</span>}
                              <span className="scenario-ac hide-sm">{acceptanceCriteriaOf(t).join(", ")}</span>
                              <span className="num muted">{fmtDuration(t.durationMs)}</span>
                              <StatusPill status={t.status} />
                            </div>
                          );
                        })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="coverage-side">
        <BreakdownCard title="By priority" groups={byPriority} empty="No priority tags on this run." meta={isAll ? "executions" : undefined} />
        <BreakdownCard title="By test type" groups={byType} empty="No test-type tags on this run." meta={isAll ? "executions" : undefined} />
      </div>
    </div>
  );
}
