/**
 * ProgrammeHealth.tsx
 *
 * Cumulative view across all runs: the quality score (last SPARKLINE_DAYS runs)
 * and the automation ROI – runs, scenarios, manual effort saved, cost savings.
 */

import type { RunSummary } from "../types";
import { ROI, SPARKLINE_DAYS } from "../config";
import { effortOf, fmtDuration, fmtUSD, totalTests } from "../lib/insights";

interface QualityScore {
  score: number;
  grade: string;
  label: string;
  color: string;
  passWeight: number;
  cleanWeight: number;
  flakyWeight: number;
}

function computeQualityScore(runs: RunSummary[]): QualityScore {
  const recent = runs.slice(0, SPARKLINE_DAYS);
  if (recent.length === 0) return { score: 0, grade: "—", label: "No data", color: "var(--text-muted)", passWeight: 0, cleanWeight: 0, flakyWeight: 0 };

  // Pillar 1 – avg pass rate (50%)
  const avgPass = recent.reduce((s, r) => s + r.passRate, 0) / recent.length;
  // Pillar 2 – clean run rate: % of runs with zero failures (30%)
  const cleanRate = (recent.filter((r) => r.totals.failed === 0).length / recent.length) * 100;
  // Pillar 3 – flaky-free rate: % of runs with zero flaky tests (15%)
  const flakyFreeRate = (recent.filter((r) => r.totals.flaky === 0).length / recent.length) * 100;
  // Pillar 4 – trend: is pass rate improving across halves? (5%)
  let trendScore = 50;
  if (recent.length >= 3) {
    const half = Math.floor(recent.length / 2);
    const newerAvg = recent.slice(0, half).reduce((s, r) => s + r.passRate, 0) / half;
    const olderAvg = recent.slice(half).reduce((s, r) => s + r.passRate, 0) / (recent.length - half);
    trendScore = newerAvg >= olderAvg ? 100 : 0;
  }

  const score = Math.min(100, Math.round(avgPass * 0.5 + cleanRate * 0.3 + flakyFreeRate * 0.15 + trendScore * 0.05));

  let grade: string, label: string, color: string;
  if (score >= 95)      { grade = "A+"; label = "Excellent";    color = "var(--accent-green)"; }
  else if (score >= 85) { grade = "A";  label = "Great";        color = "var(--accent-teal)"; }
  else if (score >= 75) { grade = "B";  label = "Good";         color = "var(--accent-blue)"; }
  else if (score >= 60) { grade = "C";  label = "Fair";         color = "var(--accent-yellow)"; }
  else                  { grade = "D";  label = "Needs Work";   color = "var(--accent-red)"; }

  return { score, grade, label, color, passWeight: Math.round(avgPass), cleanWeight: Math.round(cleanRate), flakyWeight: Math.round(flakyFreeRate) };
}

function QualityRing({ score, color }: { score: number; color: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <div className="quality-ring">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 44 44)" />
      </svg>
      <div className="quality-ring-label" style={{ color }}>{score}</div>
    </div>
  );
}

export function ProgrammeHealth({ runs }: { runs: RunSummary[] }) {
  const qs = computeQualityScore(runs);
  const based = runs.slice(0, SPARKLINE_DAYS).length;

  const scenarios = runs.reduce((s, r) => s + totalTests(r), 0);
  const automatedMs = runs.reduce((s, r) => s + (r.wallClockMs ?? r.durations.totalMs), 0);
  const effort = runs.map((r) => effortOf(r, ROI)).reduce((acc, e) => ({
    scenarios: acc.scenarios + e.scenarios, steps: acc.steps + e.steps,
    manualMs: acc.manualMs + e.manualMs, automatedMs: acc.automatedMs + e.automatedMs,
    savedMs: acc.savedMs + e.savedMs, savingsUSD: acc.savingsUSD + e.savingsUSD,
  }));
  const first = runs[runs.length - 1];

  const roi = [
    { label: "Runs executed", value: String(runs.length), sub: first ? `since ${new Date(first.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "—" },
    { label: "Scenarios executed", value: scenarios.toLocaleString(), sub: `${fmtDuration(automatedMs)} automated run time` },
    { label: "Manual effort saved", value: fmtDuration(effort.savedMs), sub: `${fmtDuration(effort.manualMs)} by hand vs ${fmtDuration(effort.automatedMs)} automated` },
    { label: "Cost savings", value: fmtUSD(effort.savingsUSD), sub: `at $${ROI.hourlyRate}/hr`, accent: true },
  ];

  return (
    <div className="health">
      <div className="health-quality">
        <QualityRing score={qs.score} color={qs.color} />
        <div className="qs-body">
          <div className="qs-head">
            <span className="card-label qs-title">Quality score</span>
            <span className="qs-grade" style={{ background: qs.color }}>{qs.grade}</span>
            <span className="qs-label" style={{ color: qs.color }}>{qs.label}</span>
          </div>
          <div className="health-pillars">
            <span>Avg pass rate <b>{qs.passWeight}%</b></span>
            <span>Clean runs <b>{qs.cleanWeight}%</b></span>
            <span>Flaky-free <b>{qs.flakyWeight}%</b></span>
          </div>
          <div className="health-note">
            Last {based} run{based !== 1 ? "s" : ""} · weighted 50% pass rate, 30% clean runs, 15% flaky-free, 5% trend
          </div>
        </div>
      </div>
      <div className="health-roi-wrap">
      <div className="health-roi">
        {roi.map((k) => (
          <div key={k.label} className={`exec-kpi${k.accent ? " health-accent" : ""}`}>
            <div className="exec-kpi-label">{k.label}</div>
            <div className="exec-kpi-value">{k.value}</div>
            <div className="exec-kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>
      <p className="health-method">
        <b>How savings are calculated:</b> only <b>passed</b> scenarios count. Manual effort = their{" "}
        {effort.steps.toLocaleString()} Gherkin steps × {ROI.minsPerStep} min per step
        {effort.scenarios && effort.steps === 0 ? ` (or ${ROI.fallbackMinsPerScenario} min per scenario where steps are unknown)` : ""}.
        Effort saved = manual effort − the automated run time of those scenarios. Cost savings = effort saved × ${ROI.hourlyRate}/hr.
        Excludes test authoring and maintenance effort.
      </p>
      </div>
    </div>
  );
}
