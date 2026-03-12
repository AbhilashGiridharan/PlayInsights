/**
 * DailySummary.tsx
 *
 * Compact vertical stat list for the "Summary of the Day" aside panel.
 * Assumptions for ROI:
 *   Manual time per test case : 5 minutes
 *   QA engineer hourly rate   : $50 USD
 */

import type { RunSummary } from "../types";

const MANUAL_MINS_PER_TEST = 5;
const HOURLY_RATE_USD      = 50;

interface DailySummaryProps {
  runs: RunSummary[];
}

function fmt(ms: number): string {
  if (ms < 1_000)     return `${ms}ms`;
  if (ms < 60_000)    return `${(ms / 1_000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1_000)}s`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function fmtUSD(dollars: number): string {
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

function fmtTime(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function DailySummary({ runs }: DailySummaryProps) {
  const todayStr  = new Date().toLocaleDateString("en-CA");
  const todayRuns = runs.filter(
    (r) => new Date(r.timestamp).toLocaleDateString("en-CA") === todayStr
  );
  const displayRuns = todayRuns.length > 0 ? todayRuns : runs.slice(0, Math.min(5, runs.length));
  const isToday     = todayRuns.length > 0;
  const dayLabel    = isToday
    ? "Today"
    : displayRuns.length > 0
      ? new Date(displayRuns[0].timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—";

  if (displayRuns.length === 0) return <div className="daily-empty">No run data available.</div>;

  const runsTriggered   = displayRuns.length;
  const testsExecuted   = displayRuns.reduce((s, r) => s + r.totals.passed + r.totals.failed + r.totals.skipped, 0);
  const avgPassRate     = displayRuns.reduce((s, r) => s + r.passRate, 0) / displayRuns.length;
  const failureRate     = (displayRuns.filter((r) => r.totals.failed > 0).length / displayRuns.length) * 100;
  const totalExecMs     = displayRuns.reduce((s, r) => s + r.durations.totalMs, 0);
  const manualTimeMins  = testsExecuted * MANUAL_MINS_PER_TEST;
  const automatedTimeMins = totalExecMs / 60_000;
  const timeSavedMins   = Math.max(0, manualTimeMins - automatedTimeMins);
  const costSavingsUSD  = (timeSavedMins / 60) * HOURLY_RATE_USD;

  const stats = [
    { icon: "🚀", label: "Runs Triggered",    value: String(runsTriggered),          accent: "var(--accent-blue)",   sub: dayLabel },
    { icon: "🧪", label: "Tests Executed",    value: testsExecuted.toLocaleString(), accent: "var(--accent-teal)",   sub: `${runsTriggered} run${runsTriggered !== 1 ? "s" : ""}` },
    { icon: "✅", label: "Pass Rate",         value: `${avgPassRate.toFixed(1)}%`,   accent: avgPassRate >= 95 ? "var(--accent-green)" : avgPassRate >= 75 ? "var(--accent-yellow)" : "var(--accent-red)",  sub: avgPassRate >= 95 ? "Excellent" : avgPassRate >= 75 ? "Good" : "Needs attention" },
    { icon: "❌", label: "Failure Rate",      value: `${failureRate.toFixed(0)}%`,   accent: failureRate === 0 ? "var(--accent-green)" : "var(--accent-red)", sub: failureRate === 0 ? "No failures" : `${displayRuns.filter(r => r.totals.failed > 0).length} run(s) failed` },
    { icon: "⏱️", label: "Time Saved",        value: fmtTime(timeSavedMins),         accent: "var(--accent-purple)", sub: `vs ${fmtTime(manualTimeMins)} manual` },
    { icon: "⚡", label: "Total Exec Time",   value: fmt(totalExecMs),               accent: "var(--accent-blue)",   sub: `avg ${fmt(Math.round(totalExecMs / runsTriggered))} / run` },
    { icon: "💰", label: "Cost Savings (ROI)",value: fmtUSD(costSavingsUSD),         accent: "var(--accent-green)",  sub: `@ $${HOURLY_RATE_USD}/hr` },
  ];

  return (
    <div className="daily-list">
      <div className="daily-list-date">
        {isToday
          ? `as of ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : `Most recent data · ${dayLabel}`}
      </div>
      {stats.map((s) => (
        <div key={s.label} className="daily-list-row">
          <span className="daily-list-icon">{s.icon}</span>
          <span className="daily-list-label">{s.label}</span>
          <span className="daily-list-value" style={{ color: s.accent }}>{s.value}</span>
          <span className="daily-list-sub">{s.sub}</span>
        </div>
      ))}
    </div>
  );
}
