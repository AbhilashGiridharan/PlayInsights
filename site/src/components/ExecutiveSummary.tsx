/**
 * ExecutiveSummary.tsx
 *
 * Customer-facing headline for the selected scope – one run, or the whole
 * history: scope picker + context chips, verdict, pass-rate hero with delta,
 * result split, key findings and KPIs.
 */

import type { RunSummary } from "../types";
import {
  ALL_RUNS_ID, criteriaCoverage, diffRuns, effortOf, fmtDuration, fmtRunDateTime, fmtRunLabel, fmtUSD,
  groupByScenario, humanize, isPossibleDefect, passRateTone, previousRun, splitScenario,
  storiesOf, totalTests, verdictOf, type Verdict,
} from "../lib/insights";
import { ROI } from "../config";

interface Props {
  runs: RunSummary[];
  /** A single run, or the aggregate built by aggregateRuns() */
  run: RunSummary;
  latestRunId: string | null;
  onSelectRun: (runId: string) => void;
}

type Tone = "good" | "warn" | "bad" | "info";
interface View {
  verdict: Verdict;
  when: string;
  delta: { value: number; label: string } | null;
  highlights: Array<{ tone: Tone; text: string }>;
  kpis: Array<{ label: string; value: string; sub: string }>;
}

const VERDICT_ICON = { good: "✓", warn: "!", bad: "✕" } as const;

function scenarioIds(names: string[]): string {
  const ids = names.map((n) => splitScenario(n).id ?? n);
  return ids.length <= 3 ? ids.join(", ") : `${ids.slice(0, 3).join(", ")} +${ids.length - 3} more`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function effortKpi(run: RunSummary) {
  const e = effortOf(run, ROI);
  return {
    label: "Manual effort saved",
    value: fmtDuration(e.savedMs),
    sub: `${fmtUSD(e.savingsUSD)} · ${e.steps.toLocaleString()} passed steps × ${ROI.minsPerStep} min`,
  };
}

function singleRunView(runs: RunSummary[], run: RunSummary): View {
  const prev    = previousRun(runs, run);
  const diff    = diffRuns(prev, run);
  const total   = totalTests(run);
  const stories = storiesOf(run);
  const storiesPassing = stories.filter((s) => s.failed === 0).length;
  const criteria = criteriaCoverage(run);
  const runtime = run.wallClockMs ?? run.durations.totalMs;

  const failedTests  = (run.tests ?? []).filter((t) => t.status === "failed");
  const defectsCount = failedTests.filter(isPossibleDefect).length;

  const highlights: View["highlights"] = [
    { tone: "info", text: `${run.totals.passed} of ${total} scenarios passed across ${plural(stories.length, "user story", "user stories")}.` },
  ];
  if (failedTests.length > 0) {
    highlights.push({
      tone: "bad",
      text: `Failing: ${scenarioIds(failedTests.map((t) => t.name))}${
        defectsCount ? ` (${defectsCount} flagged as possible product defect${defectsCount > 1 ? "s" : ""})` : ""
      }.`,
    });
  }
  if (prev) {
    if (diff.fixed.length)       highlights.push({ tone: "good", text: `${plural(diff.fixed.length, "scenario")} fixed since the previous run.` });
    if (diff.newFailures.length) highlights.push({ tone: "warn", text: `${plural(diff.newFailures.length, "new failure")} since the previous run.` });
    if (diff.persistent.length)  highlights.push({ tone: "warn", text: `${plural(diff.persistent.length, "failure")} carried over from the previous run.` });
  }
  highlights.push({
    tone: "info",
    text: `Suite ran in ${fmtDuration(runtime)}${run.environment?.browser ? ` on ${run.environment.browser.replace(" (Playwright-managed)", "")}` : ""}.`,
  });

  return {
    verdict: verdictOf(run),
    when: `Executed ${fmtRunDateTime(run.startedAt ?? run.timestamp)}`,
    delta: prev ? { value: run.passRate - prev.passRate, label: "vs previous run" } : null,
    highlights,
    kpis: [
      { label: "Scenarios executed", value: String(total), sub: `${run.totals.failed} failed · ${run.totals.skipped} skipped` },
      { label: "User stories passing", value: `${storiesPassing}/${stories.length}`, sub: "all scenarios green" },
      ...(criteria.total > 0
        ? [{ label: "Acceptance criteria met", value: `${criteria.verified}/${criteria.total}`, sub: `${Math.round((criteria.verified / criteria.total) * 100)}% verified` }]
        : []),
      ...(run.steps
        ? [{ label: "Test steps executed", value: run.steps.total.toLocaleString(), sub: `${run.steps.passed.toLocaleString()} passed` }]
        : []),
      { label: "Execution time", value: fmtDuration(runtime), sub: `avg ${fmtDuration(run.durations.avgTestMs)} / scenario` },
      effortKpi(run),
    ],
  };
}

function historyView(runs: RunSummary[], agg: RunSummary): View {
  const first = runs[runs.length - 1];
  const last  = runs[0];
  const executions = totalTests(agg);
  const scenarios  = groupByScenario(agg.tests ?? []);
  const stories    = storiesOf(agg);
  const alwaysGreen = stories.filter((s) => s.failed === 0).length;
  const best  = runs.reduce((a, b) => (b.passRate > a.passRate ? b : a));
  const worst = runs.reduce((a, b) => (b.passRate < a.passRate ? b : a));
  const cleanRuns = runs.filter((r) => r.totals.failed === 0).length;

  const recurring = scenarios
    .map((g) => ({ name: g.name, failed: g.runs.filter((t) => t.status === "failed").length, ran: g.runs.length }))
    .filter((g) => g.failed > 0)
    .sort((a, b) => b.failed - a.failed || b.failed / b.ran - a.failed / a.ran);
  const neverFailed = scenarios.length - recurring.length;

  const highlights: View["highlights"] = [
    { tone: "info", text: `${plural(runs.length, "run")} between ${fmtRunLabel(first.timestamp)} and ${fmtRunLabel(last.timestamp)}, ${executions.toLocaleString()} scenario executions in total.` },
  ];
  if (recurring.length) {
    highlights.push({
      tone: "bad",
      text: `Most frequent failures: ${recurring.slice(0, 3).map((g) => `${splitScenario(g.name).id ?? g.name} (${g.failed}/${g.ran} runs)`).join(", ")}.`,
    });
  }
  highlights.push({
    tone: neverFailed === scenarios.length ? "good" : "info",
    text: `${neverFailed} of ${scenarios.length} scenarios have never failed; ${alwaysGreen} of ${stories.length} user stories passed in every run.`,
  });
  highlights.push({
    tone: last.passRate >= first.passRate ? "good" : "warn",
    text: `Pass rate moved from ${first.passRate.toFixed(1)}% in the first run to ${last.passRate.toFixed(1)}% in the latest.`,
  });
  highlights.push({
    tone: "info",
    text: `Best run ${fmtRunLabel(best.timestamp)} (${best.passRate.toFixed(1)}%), weakest ${fmtRunLabel(worst.timestamp)} (${worst.passRate.toFixed(1)}%).`,
  });

  const tone = passRateTone(agg.passRate);
  const steps = agg.steps;
  return {
    verdict: {
      tone,
      title: tone === "good" ? "Consistently stable" : tone === "warn" ? "Mostly stable" : "Unstable across runs",
      detail: `${agg.totals.passed.toLocaleString()} of ${executions.toLocaleString()} scenario executions passed across ${plural(runs.length, "run")}; ${plural(cleanRuns, "run")} fully green.`,
    },
    when: `From ${fmtRunDateTime(first.startedAt ?? first.timestamp)} to ${fmtRunDateTime(last.timestamp)}`,
    delta: runs.length > 1 ? { value: last.passRate - first.passRate, label: "first → latest run" } : null,
    highlights,
    kpis: [
      { label: "Runs executed", value: String(runs.length), sub: `${cleanRuns} fully green` },
      { label: "Scenario executions", value: executions.toLocaleString(), sub: `${scenarios.length} unique scenarios` },
      { label: "Stories always green", value: `${alwaysGreen}/${stories.length}`, sub: "passed in every run" },
      ...(steps ? [{ label: "Test steps executed", value: steps.total.toLocaleString(), sub: `${steps.passed.toLocaleString()} passed` }] : []),
      { label: "Total execution time", value: fmtDuration(agg.wallClockMs ?? agg.durations.totalMs), sub: `avg ${fmtDuration(agg.durations.avgTestMs)} / scenario` },
      effortKpi(agg),
    ],
  };
}

export function ExecutiveSummary({ runs, run, latestRunId, onSelectRun }: Props) {
  const isAll = run.runId === ALL_RUNS_ID;
  const view  = isAll ? historyView(runs, run) : singleRunView(runs, run);
  const total = totalTests(run);
  const feature = run.feature ?? run.environment?.feature;
  const seg = (n: number) => `${total > 0 ? (n / total) * 100 : 0}%`;

  const env = run.environment;
  const chips = [
    feature && humanize(feature),
    env?.browser?.replace(" (Playwright-managed)", ""),
    env?.platform === "darwin" ? "macOS" : env?.os,
    env?.playwright && `Playwright ${env.playwright}`,
  ].filter(Boolean) as string[];

  return (
    <section className="exec" aria-label="Executive summary">
      {/* Scope + run context bar */}
      <div className="exec-context">
        <div className="exec-context-left">
          <div className="scope-toggle" role="group" aria-label="Report scope">
            <button className={!isAll ? "active" : ""} aria-pressed={!isAll}
              onClick={() => isAll && latestRunId && onSelectRun(latestRunId)}>
              Single run
            </button>
            <button className={isAll ? "active" : ""} aria-pressed={isAll}
              onClick={() => onSelectRun(ALL_RUNS_ID)}>
              All runs <span className="scope-count">{runs.length}</span>
            </button>
          </div>
          {!isAll && (
            <label className="exec-run-picker">
              <span className="visually-hidden">Report for run</span>
              <select value={run.runId} onChange={(e) => onSelectRun(e.target.value)}>
                {runs.map((r) => (
                  <option key={r.runId} value={r.runId}>
                    {fmtRunLabel(r.timestamp)} · {r.passRate.toFixed(1)}% pass
                    {r.runId === latestRunId ? " (latest)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="exec-chips">
            {chips.map((c) => <span key={c} className="chip">{c}</span>)}
          </div>
        </div>
        <div className="exec-context-right">
          {run.ciUrl && (
            <a className="btn btn-sm" href={run.ciUrl} target="_blank" rel="noreferrer">Raw results ↗</a>
          )}
          <button className="btn btn-sm" onClick={() => window.print()}>Export PDF</button>
        </div>
      </div>

      {/* Hero */}
      <div className={`exec-hero tone-${view.verdict.tone}`}>
        <div className="exec-verdict">
          <span className="exec-verdict-icon" aria-hidden="true">{VERDICT_ICON[view.verdict.tone]}</span>
          <div>
            <div className="exec-verdict-title">{view.verdict.title}</div>
            <div className="exec-verdict-detail">{view.verdict.detail}</div>
            <div className="exec-verdict-when">{view.when}</div>
          </div>
        </div>

        <div className="exec-rate">
          <div className="exec-rate-label">{isAll ? "Overall pass rate" : "Pass rate"}</div>
          <div className="exec-rate-value">{run.passRate.toFixed(1)}<span>%</span></div>
          {view.delta && (
            <div className={`exec-delta ${view.delta.value > 0 ? "up" : view.delta.value < 0 ? "down" : ""}`}>
              {view.delta.value > 0 ? "▲" : view.delta.value < 0 ? "▼" : "■"} {Math.abs(view.delta.value).toFixed(1)} pts {view.delta.label}
            </div>
          )}
          <div className="exec-split" role="img"
            aria-label={`${run.totals.passed} passed, ${run.totals.failed} failed, ${run.totals.skipped} skipped`}>
            {run.totals.passed  > 0 && <span className="seg seg-pass" style={{ width: seg(run.totals.passed) }} />}
            {run.totals.failed  > 0 && <span className="seg seg-fail" style={{ width: seg(run.totals.failed) }} />}
            {run.totals.skipped > 0 && <span className="seg seg-skip" style={{ width: seg(run.totals.skipped) }} />}
          </div>
          <div className="exec-split-legend">
            <span><i className="dot dot-pass" />Passed <b>{run.totals.passed}</b></span>
            <span><i className="dot dot-fail" />Failed <b>{run.totals.failed}</b></span>
            <span><i className="dot dot-skip" />Skipped <b>{run.totals.skipped}</b></span>
            {run.totals.flaky > 0 && <span><i className="dot dot-flaky" />Flaky <b>{run.totals.flaky}</b></span>}
          </div>
        </div>

        <div className="exec-highlights">
          <div className="exec-highlights-title">Key findings</div>
          <ul>
            {view.highlights.map((h, i) => (
              <li key={i} className={`hl hl-${h.tone}`}>{h.text}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* KPI strip */}
      <div className="exec-kpis">
        {view.kpis.map((k) => (
          <div key={k.label} className="exec-kpi">
            <div className="exec-kpi-label">{k.label}</div>
            <div className="exec-kpi-value">{k.value}</div>
            <div className="exec-kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
