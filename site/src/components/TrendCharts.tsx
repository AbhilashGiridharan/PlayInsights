import { lazy, Suspense } from "react";
import type { RunSummary } from "../types";
import { SPARKLINE_DAYS } from "../config";
import { fmtDuration, fmtRunLabel } from "../lib/insights";

// Code-split chart.js
const Line = lazy(() =>
  import("react-chartjs-2").then((m) => ({ default: m.Line }))
);
const Bar = lazy(() =>
  import("react-chartjs-2").then((m) => ({ default: m.Bar }))
);

// Register chart.js components
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TrendChartsProps {
  runs: RunSummary[];
  theme?: "dark" | "light";
  selectedRunId?: string | null;
}

/** Read the live theme tokens so charts follow the light/dark toggle. */
function tokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    pass: v("--status-pass"), fail: v("--status-fail"), skip: v("--status-skip"),
    series: v("--series-1"), surface: v("--bg-surface"), border: v("--border"),
    text: v("--text-secondary"), muted: v("--text-muted"), primary: v("--text-primary"),
  };
}

function withAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function buildChartOptions(t: ReturnType<typeof tokens>) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        position: "top" as const,
        align: "end" as const,
        labels: { color: t.text, boxWidth: 10, boxHeight: 10, padding: 14, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: t.surface,
        borderColor:     t.border,
        borderWidth: 1,
        titleColor: t.primary,
        bodyColor:  t.text,
        padding: 10,
      },
    },
    scales: {
      x: {
        ticks: { color: t.muted, font: { size: 11 }, maxRotation: 0, autoSkip: true },
        grid:  { display: false },
        border: { color: t.border },
      },
      y: {
        ticks: { color: t.muted, font: { size: 11 } },
        grid:  { color: t.border },
        border: { display: false },
      },
    },
  };
}

function LoadingChart() {
  return <div className="skeleton" style={{ height: 240, borderRadius: "var(--radius-sm)" }} />;
}

export function TrendCharts({ runs, theme = "dark", selectedRunId }: TrendChartsProps) {
  const t = tokens();
  const chartOptions = buildChartOptions(t);
  const recent = [...runs].slice(0, SPARKLINE_DAYS).reverse();
  const labels = recent.map((r) => fmtRunLabel(r.timestamp).replace(",", ""));
  const isSel = (r: RunSummary) => r.runId === selectedRunId;

  // ── Pass rate trend (line) ───────────────────────────────────────────────
  const passRateData = {
    labels,
    datasets: [
      {
        label: "Pass rate %",
        data: recent.map((r) => r.passRate),
        borderColor: t.series,
        backgroundColor: withAlpha(t.series || "#2a78d6", 0.12),
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: recent.map((r) => (isSel(r) ? 6 : 4)),
        pointBackgroundColor: recent.map((r) => (isSel(r) ? t.series : t.surface)),
        pointBorderColor: t.series,
        pointBorderWidth: 2,
      },
    ],
  };

  const passRateOptions = {
    ...chartOptions,
    plugins: { ...chartOptions.plugins, legend: { display: false } },
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        min: 0,
        max: 100,
        ticks: { ...chartOptions.scales.y.ticks, callback: (v: number | string) => `${v}%` },
      },
    },
  };

  // ── Results per run (stacked bar) ────────────────────────────────────────
  const barCommon = { borderRadius: 4, borderSkipped: false, borderColor: t.surface, borderWidth: 1, maxBarThickness: 36 };
  const resultsTrendData = {
    labels,
    datasets: [
      { label: "Passed",  data: recent.map((r) => r.totals.passed),  backgroundColor: t.pass, ...barCommon },
      { label: "Failed",  data: recent.map((r) => r.totals.failed),  backgroundColor: t.fail, ...barCommon },
      { label: "Skipped", data: recent.map((r) => r.totals.skipped), backgroundColor: t.skip, ...barCommon },
    ],
  };
  const stackedOptions = {
    ...chartOptions,
    scales: {
      x: { ...chartOptions.scales.x, stacked: true },
      y: { ...chartOptions.scales.y, stacked: true, ticks: { ...chartOptions.scales.y.ticks, precision: 0 } },
    },
  };

  // ── Execution time per run (bar) ─────────────────────────────────────────
  const durationData = {
    labels,
    datasets: [
      {
        label: "Execution time",
        data: recent.map((r) => Math.round((r.wallClockMs ?? r.durations.totalMs) / 1000)),
        backgroundColor: recent.map((r) => (isSel(r) ? t.series : withAlpha(t.series || "#2a78d6", 0.45))),
        ...barCommon,
      },
    ],
  };
  const durationOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      legend: { display: false },
      tooltip: {
        ...chartOptions.plugins.tooltip,
        callbacks: { label: (ctx: { parsed: { y: number } }) => ` ${fmtDuration(ctx.parsed.y * 1000)}` },
      },
    },
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        ticks: { ...chartOptions.scales.y.ticks, callback: (v: number | string) => fmtDuration(Number(v) * 1000) },
      },
    },
  };

  return (
    <div className="charts-grid" key={theme}>
      <div className="chart-panel">
        <h3>Pass rate trend</h3>
        <div className="chart-box">
          <Suspense fallback={<LoadingChart />}>
            <Line data={passRateData} options={passRateOptions as never} />
          </Suspense>
        </div>
      </div>

      <div className="chart-panel">
        <h3>Results per run</h3>
        <div className="chart-box">
          <Suspense fallback={<LoadingChart />}>
            <Bar data={resultsTrendData} options={stackedOptions as never} />
          </Suspense>
        </div>
      </div>

      <div className="chart-panel">
        <h3>Execution time per run</h3>
        <div className="chart-box">
          <Suspense fallback={<LoadingChart />}>
            <Bar data={durationData} options={durationOptions as never} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
