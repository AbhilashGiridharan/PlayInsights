import type { RunSummary } from "../types";
import { SPARKLINE_DAYS } from "../config";

interface SummaryCardsProps {
  runs: RunSummary[];
  latest: RunSummary | null;
}

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function PassRateRing({ rate }: { rate: number }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const fill = (rate / 100) * circ;
  const color =
    rate >= 95
      ? "var(--accent-green)"
      : rate >= 75
      ? "var(--accent-yellow)"
      : "var(--accent-red)";

  return (
    <div className="pass-rate-ring">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="pass-rate-label" style={{ color }}>
        {rate.toFixed(0)}%
      </div>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="sparkline-wrap" title={`Last ${data.length} values`}>
      {data.map((v, i) => (
        <div
          key={i}
          className="sparkline-bar"
          style={{
            height: `${Math.max(2, (v / max) * 100)}%`,
            background: color,
            opacity: 0.4 + 0.6 * (i / data.length),
          }}
        />
      ))}
    </div>
  );
}

export function SummaryCards({ runs, latest }: SummaryCardsProps) {
  const recent = runs.slice(0, SPARKLINE_DAYS);

  const totalRuns = runs.length;
  const totalTests = runs.reduce(
    (s, r) => s + r.totals.passed + r.totals.failed + r.totals.skipped,
    0
  );
  const totalFlaky = runs.reduce((s, r) => s + r.totals.flaky, 0);
  const avgPassRate =
    recent.length > 0
      ? recent.reduce((s, r) => s + r.passRate, 0) / recent.length
      : 0;
  const totalDuration = runs.reduce((s, r) => s + r.durations.totalMs, 0);
  const failureRate =
    recent.length > 0
      ? (recent.filter((r) => r.totals.failed > 0).length / recent.length) * 100
      : 0;

  const passRateData = [...recent].reverse().map((r) => r.passRate);
  const durationData = [...recent].reverse().map((r) => r.durations.totalMs);

  return (
    <>
      <div className="cards-grid">
        {/* Runs Triggered */}
        <div className="card card-blue">
          <div className="card-label">Runs Triggered</div>
          <div className="card-value" style={{ color: "var(--accent-blue)" }}>
            {totalRuns}
          </div>
          <div className="card-sub">all time</div>
          <Sparkline data={recent.map((_, i) => i + 1)} color="var(--accent-blue)" />
        </div>

        {/* Tests Executed */}
        <div className="card card-teal">
          <div className="card-label">Tests Executed</div>
          <div className="card-value" style={{ color: "var(--accent-teal)" }}>
            {totalTests.toLocaleString()}
          </div>
          <div className="card-sub">all runs</div>
        </div>

        {/* Pass Rate */}
        <div className="card card-green" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="card-label">Pass Rate</div>
            <div className="card-sub">avg last {SPARKLINE_DAYS} runs</div>
            <div style={{ marginTop: 8 }}>
              <Sparkline data={passRateData} color="var(--accent-green)" />
            </div>
          </div>
          <PassRateRing rate={Math.round(avgPassRate)} />
        </div>

        {/* Failure Rate */}
        <div className="card card-red">
          <div className="card-label">Failure Rate</div>
          <div
            className="card-value"
            style={{
              color: failureRate > 20 ? "var(--accent-red)" : "var(--accent-green)",
            }}
          >
            {failureRate.toFixed(0)}%
          </div>
          <div className="card-sub">runs with ≥1 failure</div>
        </div>

        {/* Latest pass rate */}
        <div className="card card-green">
          <div className="card-label">Latest Pass Rate</div>
          <div
            className="card-value"
            style={{
              color:
                (latest?.passRate ?? 0) >= 95
                  ? "var(--accent-green)"
                  : (latest?.passRate ?? 0) >= 75
                  ? "var(--accent-yellow)"
                  : "var(--accent-red)",
            }}
          >
            {latest?.passRate.toFixed(1) ?? "—"}%
          </div>
          <div className="card-sub">{latest?.branch ?? "—"}</div>
        </div>

        {/* Total Execution Time */}
        <div className="card card-purple">
          <div className="card-label">Total Exec Time</div>
          <div className="card-value" style={{ color: "var(--accent-purple)" }}>
            {fmt(totalDuration)}
          </div>
          <div className="card-sub">all runs</div>
          <Sparkline data={durationData} color="var(--accent-purple)" />
        </div>

        {/* Flaky Tests */}
        <div className="card card-yellow">
          <div className="card-label">Flaky Tests</div>
          <div className="card-value" style={{ color: "var(--accent-yellow)" }}>
            {totalFlaky}
          </div>
          <div className="card-sub">cumulative</div>
        </div>

        {/* Avg Duration */}
        <div className="card card-teal">
          <div className="card-label">Avg Test Duration</div>
          <div className="card-value" style={{ color: "var(--accent-teal)", fontSize: 20 }}>
            {latest ? fmt(latest.durations.avgTestMs) : "—"}
          </div>
          <div className="card-sub">
            p95: {latest ? fmt(latest.durations.p95TestMs) : "—"}
          </div>
        </div>
      </div>
    </>
  );
}
