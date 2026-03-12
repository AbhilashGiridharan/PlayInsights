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
    <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 44 44)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20, color }}>
        {score}
      </div>
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

  const qs = computeQualityScore(runs);

  return (
    <>
      {/* Quality Score Banner */}
      <div className="card quality-score-card" style={{ marginBottom: 16, borderLeft: `4px solid ${qs.color}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <QualityRing score={qs.score} color={qs.color} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span className="card-label" style={{ fontSize: 12 }}>🏅 Quality Score</span>
              <span style={{ background: qs.color, color: "#fff", fontWeight: 800, fontSize: 13, borderRadius: 6, padding: "2px 10px", letterSpacing: "0.04em" }}>{qs.grade}</span>
              <span style={{ color: qs.color, fontWeight: 600, fontSize: 14 }}>{qs.label}</span>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 6 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Avg Pass Rate</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-green)" }}>{qs.passWeight}%</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>50% weight</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Clean Runs</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-blue)" }}>{qs.cleanWeight}%</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>30% weight</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Flaky-Free Runs</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-purple)" }}>{qs.flakyWeight}%</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>15% weight</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Based On</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{runs.slice(0, SPARKLINE_DAYS).length}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>run{runs.length !== 1 ? "s" : ""}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

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

        {/* Longest Test */}
        <div className="card card-red">
          <div className="card-label">🐢 Longest Test</div>
          <div className="card-value" style={{ color: "var(--accent-red)", fontSize: 20 }}>
            {latest?.longestTest ? fmt(latest.longestTest.durationMs) : "—"}
          </div>
          <div className="card-sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={latest?.longestTest?.name}>
            {latest?.longestTest?.name ?? "—"}
          </div>
        </div>

        {/* Fastest Test */}
        <div className="card card-green">
          <div className="card-label">⚡ Fastest Test</div>
          <div className="card-value" style={{ color: "var(--accent-green)", fontSize: 20 }}>
            {latest?.fastestTest ? fmt(latest.fastestTest.durationMs) : "—"}
          </div>
          <div className="card-sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={latest?.fastestTest?.name}>
            {latest?.fastestTest?.name ?? "—"}
          </div>
        </div>
      </div>
    </>
  );
}
