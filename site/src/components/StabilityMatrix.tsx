/**
 * StabilityMatrix.tsx
 *
 * Scenario × run grid showing how each scenario behaved across recent runs,
 * so persistent failures and unstable scenarios stand out. Clicking a run
 * column selects that run for the rest of the report.
 */

import type { RunSummary } from "../types";
import { fmtDuration, fmtRunLabel, groupByScenario, splitScenario } from "../lib/insights";

const MAX_COLUMNS = 10;

/**
 * Stability class of a scenario from its statuses in the runs it took part in
 * (oldest → newest; runs where it was not executed are ignored):
 *   stable     – passed every time        always-failing – failed every time
 *   recovered  – failed, then passed      regressed      – passed, then failed
 *   unstable   – status changed 2+ times  single         – only ran once
 */
type Stability = "stable" | "always-failing" | "recovered" | "regressed" | "unstable" | "single";

const STABILITY: Record<Stability, { label: string; hint: string }> = {
  "unstable":       { label: "Unstable",       hint: "Switched between pass and fail two or more times" },
  "always-failing": { label: "Always failing", hint: "Failed in every run it was executed in" },
  "regressed":      { label: "Regressed",      hint: "Was passing, now failing" },
  "recovered":      { label: "Recovered",      hint: "Was failing, now passing" },
  "stable":         { label: "Stable",         hint: "Passed in every run it was executed in" },
  "single":         { label: "One run",        hint: "Executed in only one run – not enough history" },
};

function classify(statuses: string[]): { stability: Stability; flips: number } {
  // Skipped runs say nothing about pass/fail stability
  const seq = statuses.filter((st) => st !== "skipped");
  let flips = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) flips++;
  if (seq.length <= 1) return { stability: "single", flips };
  if (flips === 0) return { stability: seq[0] === "passed" ? "stable" : "always-failing", flips };
  if (flips >= 2) return { stability: "unstable", flips };
  return { stability: seq[seq.length - 1] === "passed" ? "recovered" : "regressed", flips };
}

interface Props {
  runs: RunSummary[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}

export function StabilityMatrix({ runs, selectedRunId, onSelectRun }: Props) {
  const cols = runs.filter((r) => r.tests && r.tests.length > 0).slice(0, MAX_COLUMNS).reverse();
  if (cols.length === 0) {
    return <div className="panel"><div className="panel-empty">No per-scenario data available yet.</div></div>;
  }

  const names = [...new Set(cols.flatMap((r) => r.tests!.map((t) => t.name)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const rows = names.map((name) => {
    const cells = cols.map((r) => r.tests!.find((t) => t.name === name) ?? null);
    const ran = cells.filter(Boolean);
    const passed = ran.filter((c) => c!.status === "passed").length;
    return { name, cells, passed, ran: ran.length, ...classify(ran.map((c) => c!.status)) };
  });

  const count = (k: Stability) => rows.filter((r) => r.stability === k).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Scenario stability across runs</h3>
        <div className="matrix-legend">
          <span><i className="cell-swatch passed" />Passed</span>
          <span><i className="cell-swatch failed" />Failed</span>
          <span><i className="cell-swatch skipped" />Skipped</span>
          <span><i className="cell-swatch none" />Not run</span>
        </div>
      </div>
      <div className="matrix-summary">
        <span><b>{rows.length}</b> scenarios over <b>{cols.length}</b> runs</span>
        {(["always-failing", "regressed", "unstable", "recovered", "stable"] as Stability[]).map((k) => (
          <span key={k} className={`stab-sum stab-sum-${k}`} title={STABILITY[k].hint}>
            <b>{count(k)}</b> {STABILITY[k].label.toLowerCase()}
          </span>
        ))}
      </div>
      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th className="matrix-name-col">Scenario</th>
              {cols.map((r) => (
                <th key={r.runId} className={r.runId === selectedRunId ? "is-selected" : ""}>
                  <button className="matrix-col-btn" onClick={() => onSelectRun(r.runId)}
                    title={`Show report for ${fmtRunLabel(r.timestamp)}`}>
                    {fmtRunLabel(r.timestamp).replace(",", "")}
                  </button>
                </th>
              ))}
              <th className="matrix-rate-col">Pass</th>
              <th className="matrix-stab-col">Stability</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const sc = splitScenario(row.name);
              return (
                <tr key={row.name}>
                  <td className="matrix-name-col" title={row.name}>
                    {sc.id && <span className="scenario-id">{sc.id}</span>}
                    <span className="matrix-title">{sc.title}</span>
                  </td>
                  {row.cells.map((c, i) => (
                    <td key={cols[i].runId} className={cols[i].runId === selectedRunId ? "is-selected" : ""}>
                      <span
                        className={`cell-swatch ${c ? c.status : "none"}`}
                        title={c
                          ? `${fmtRunLabel(cols[i].timestamp)} — ${c.status} in ${fmtDuration(c.durationMs)}`
                          : `${fmtRunLabel(cols[i].timestamp)} — not run`}
                      />
                    </td>
                  ))}
                  <td className="matrix-rate-col num">{row.passed}/{row.ran}</td>
                  <td className="matrix-stab-col">
                    <span className={`stab stab-${row.stability}`}
                      title={`${STABILITY[row.stability].hint}${row.flips ? ` (${row.flips} change${row.flips > 1 ? "s" : ""})` : ""}`}>
                      {STABILITY[row.stability].label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SlowestScenarios({ run, limit = 8 }: { run: RunSummary; limit?: number }) {
  // In "all runs" mode rank scenarios by their average duration across runs
  const tests = groupByScenario(run.tests ?? [])
    .map(({ name, runs }) => ({ name, durationMs: runs.reduce((s, t) => s + t.durationMs, 0) / runs.length }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
  const max = tests[0]?.durationMs || 1;
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{run.aggregateOf ? "Slowest scenarios (average)" : "Slowest scenarios"}</h3>
        <span className="panel-meta">p95 {fmtDuration(run.durations.p95TestMs)} · avg {fmtDuration(run.durations.avgTestMs)}</span>
      </div>
      {tests.length === 0 ? (
        <div className="panel-empty">No per-scenario timings for this run.</div>
      ) : (
        <div className="slow-rows">
          {tests.map((t) => {
            const sc = splitScenario(t.name);
            return (
              <div key={t.name} className="slow-row" title={t.name}>
                <span className="slow-name">
                  {sc.id && <span className="scenario-id">{sc.id}</span>}
                  <span className="slow-title">{sc.title}</span>
                </span>
                <div className="slow-track">
                  <span className="slow-fill" style={{ width: `${(t.durationMs / max) * 100}%` }} />
                </div>
                <span className="num slow-value">{fmtDuration(t.durationMs)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
