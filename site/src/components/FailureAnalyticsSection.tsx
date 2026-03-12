/**
 * FailureAnalyticsSection.tsx
 *
 * Self-contained Failure Analysis component. Drop into any page section:
 *
 *   <section id="failure-analysis">
 *     <h2>Failure Analysis</h2>
 *     <FailureAnalyticsSection dataUrl="/data/analysis.json" maxItems={20} />
 *   </section>
 *
 * Expected JSON at `dataUrl` — see AnalysisPayload type below.
 * For GitHub Pages wire it as:
 *   dataUrl={`https://raw.githubusercontent.com/<owner>/<repo>/main/data/analysis.json`}
 */

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RootCause   { type: string; count: number }
interface ByComponent { name: string; failures: number }
interface FlakyTest   {
  testId: string;
  failRate: number;
  pattern: string;
  suggestedFix: string;
}
interface RecentFailure {
  runId: string;
  when: string;
  project: string;
  suite: string;
  testId: string;
  component: string;
  rootCause: string;
  error: string;
  suggestedFix: string;
  ciUrl: string;
  reportUrl: string;
}
interface AnalysisPayload {
  generatedAt: string;
  coverage?: { totalTests: number; executed: number };
  summary: {
    failures: number;
    failureRate: number;
    newFailures: number;
    flakyTests: number;
    meanTimeToFixHrs?: number;
  };
  rootCauses: RootCause[];
  byComponent: ByComponent[];
  flaky: FlakyTest[];
  recentFailures: RecentFailure[];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  dataUrl: string;
  maxItems?: number;
  className?: string;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatPercent(n: number) { return n.toFixed(1) + "%"; }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function clx(...args: (string | undefined | false)[]) {
  return args.filter(Boolean).join(" ");
}

// ── Tiny SVG Donut ────────────────────────────────────────────────────────────

const DONUT_COLORS = ["#7c3aed","#2563eb","#0d9488","#d97706","#dc2626","#16a34a"];

function DonutChart({ data }: { data: RootCause[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const r = 40; const cx = 52; const cy = 52; const stroke = 20;
  let offset = 0;
  const circ = 2 * Math.PI * r;
  const arcs = data.map((d, i) => {
    const pct  = d.count / total;
    const dash = pct * circ;
    const arc  = { ...d, dash, offset, color: DONUT_COLORS[i % DONUT_COLORS.length] };
    offset += dash;
    return arc;
  });

  return (
    <div className="fa-donut-wrap">
      <svg width="104" height="104" role="img" aria-label="Root cause donut chart" viewBox="0 0 104 104">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {arcs.map((a, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={a.color} strokeWidth={stroke}
            strokeDasharray={`${a.dash} ${circ - a.dash}`}
            strokeDashoffset={circ / 4 - a.offset}
            strokeLinecap="butt">
            <title>{a.type}: {a.count}</title>
          </circle>
        ))}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="700"
          fill="var(--text-primary)">{total}</text>
      </svg>
      <ul className="fa-donut-legend" aria-label="Legend">
        {arcs.map((a, i) => (
          <li key={i} className="fa-legend-item">
            <span className="fa-legend-dot" style={{ background: a.color }} />
            <span className="fa-legend-label">{a.type}</span>
            <span className="fa-legend-count">{a.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="fa-skeleton-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton fa-skeleton-card" />
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function FailureAnalyticsSection({ dataUrl, maxItems = 20, className }: Props) {
  const [data, setData]     = useState<AnalysisPayload | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(dataUrl, { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<AnalysisPayload>; })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dataUrl]);

  if (loading) return <Skeleton />;
  if (error)   return <div className="fa-error">⚠ Failed to load failure data: {error}</div>;
  if (!data)   return null;

  const { summary, coverage, rootCauses, byComponent, flaky, recentFailures } = data;
  const maxComp = Math.max(...byComponent.map((c) => c.failures), 1);

  const kpis = [
    { label: "Failure Rate",   value: formatPercent(summary.failureRate), accent: summary.failureRate > 10 ? "var(--accent-red)" : "var(--accent-yellow)", sub: coverage ? `${coverage.executed} executed` : undefined },
    { label: "Total Failures", value: String(summary.failures),           accent: "var(--accent-red)",    sub: "in lookback window" },
    { label: "New Failures",   value: String(summary.newFailures),        accent: "var(--accent-yellow)", sub: "first seen last 24h" },
    { label: "Flaky Tests",    value: String(summary.flakyTests),         accent: "var(--accent-purple)", sub: summary.meanTimeToFixHrs ? `MTTF ${summary.meanTimeToFixHrs}h` : undefined },
  ];

  return (
    <div className={clx("fa-root", className)}>

      {/* KPI row */}
      <div className="fa-kpi-grid" role="list">
        {kpis.map((k) => (
          <div key={k.label} className="fa-kpi-card" role="listitem">
            <span className="fa-kpi-label">{k.label}</span>
            <span className="fa-kpi-value" style={{ color: k.accent }}>{k.value}</span>
            {k.sub && <span className="fa-kpi-sub">{k.sub}</span>}
          </div>
        ))}
      </div>

      {/* Mid row: donut + components */}
      <div className="fa-mid-row">

        {/* Root Cause Donut */}
        <div className="fa-panel fa-panel-donut">
          <h3 className="fa-panel-title">Root Cause Distribution</h3>
          {rootCauses.length === 0
            ? <p className="fa-empty">No root cause data.</p>
            : <DonutChart data={rootCauses} />}
        </div>

        {/* Top Components */}
        <div className="fa-panel fa-panel-components">
          <h3 className="fa-panel-title">Top Components by Failures</h3>
          {byComponent.length === 0
            ? <p className="fa-empty">No component data.</p>
            : (
              <ul className="fa-comp-list" aria-label="Components by failure count">
                {byComponent.map((c) => (
                  <li key={c.name} className="fa-comp-row">
                    <span className="fa-comp-name">{c.name}</span>
                    <div className="fa-comp-bar-wrap">
                      <div className="fa-comp-bar" style={{ width: `${(c.failures / maxComp) * 100}%` }} />
                    </div>
                    <span className="fa-comp-badge">{c.failures}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>

      {/* Flaky Tests */}
      <div className="fa-panel">
        <h3 className="fa-panel-title">Flaky Tests</h3>
        {flaky.length === 0
          ? <p className="fa-empty">🎉 No flaky tests detected.</p>
          : (
            <div className="fa-table-wrap">
              <table className="fa-table" aria-label="Flaky tests">
                <caption className="fa-table-caption">Tests with intermittent outcomes</caption>
                <thead>
                  <tr>
                    <th>Test ID</th>
                    <th>Fail Rate</th>
                    <th>Pattern</th>
                    <th>Suggested Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {flaky.slice(0, 10).map((f) => (
                    <tr key={f.testId}>
                      <td title={f.testId} className="fa-td-clamp">{f.testId}</td>
                      <td><span className="fa-badge fa-badge-yellow">{formatPercent(f.failRate)}</span></td>
                      <td title={f.pattern} className="fa-td-clamp">{f.pattern}</td>
                      <td title={f.suggestedFix} className="fa-td-clamp fa-td-fix">{f.suggestedFix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Recent Failures */}
      <div className="fa-panel">
        <h3 className="fa-panel-title">Recent Failures</h3>
        {recentFailures.length === 0
          ? <p className="fa-empty">🎉 No recent failures found.</p>
          : (
            <div className="fa-table-wrap">
              <table className="fa-table" aria-label="Recent test failures">
                <caption className="fa-table-caption">Latest {Math.min(recentFailures.length, maxItems)} failure(s)</caption>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Project</th>
                    <th>Suite</th>
                    <th>Test ID</th>
                    <th>Component</th>
                    <th>Root Cause</th>
                    <th>Error</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFailures.slice(0, maxItems).map((f) => (
                    <tr key={f.runId + f.testId}>
                      <td className="fa-td-nowrap">{timeAgo(f.when)}</td>
                      <td><span className="fa-badge fa-badge-blue">{f.project}</span></td>
                      <td title={f.suite} className="fa-td-clamp">{f.suite}</td>
                      <td title={f.testId} className="fa-td-clamp">{f.testId}</td>
                      <td>{f.component}</td>
                      <td><span className="fa-badge fa-badge-red">{f.rootCause}</span></td>
                      <td title={f.error} className="fa-td-clamp fa-td-error">{f.error}</td>
                      <td className="fa-td-actions">
                        {f.ciUrl     && <a href={f.ciUrl}     target="_blank" rel="noreferrer" className="fa-action-link" aria-label="Open CI run">CI</a>}
                        {f.reportUrl && <a href={f.reportUrl} target="_blank" rel="noreferrer" className="fa-action-link" aria-label="Open HTML report">Report</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <p className="fa-footer">Generated {timeAgo(data.generatedAt)}</p>
    </div>
  );
}
