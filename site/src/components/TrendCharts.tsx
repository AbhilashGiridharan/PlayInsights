import { lazy, Suspense } from "react";
import type { RunSummary } from "../types";
import { SPARKLINE_DAYS } from "../config";

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
}

const CHART_COLORS = {
  green: "rgba(74,222,128,",
  red: "rgba(248,113,113,",
  yellow: "rgba(251,191,36,",
  blue: "rgba(96,165,250,",
  purple: "rgba(167,139,250,",
};

const BASE_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      labels: { color: "#9399b2", boxWidth: 12, padding: 16, font: { size: 12 } },
    },
    tooltip: {
      backgroundColor: "#1a1d27",
      borderColor: "#2e3150",
      borderWidth: 1,
      titleColor: "#e8eaf6",
      bodyColor: "#9399b2",
    },
  },
  scales: {
    x: {
      ticks: { color: "#5c6080", font: { size: 11 }, maxRotation: 45 },
      grid: { color: "rgba(46,49,80,0.6)" },
    },
    y: {
      ticks: { color: "#5c6080", font: { size: 11 } },
      grid: { color: "rgba(46,49,80,0.6)" },
    },
  },
};

function LoadingChart() {
  return (
    <div
      className="skeleton"
      style={{ height: 200, borderRadius: "var(--radius-sm)" }}
    />
  );
}

export function TrendCharts({ runs }: TrendChartsProps) {
  const recent = [...runs].slice(0, SPARKLINE_DAYS).reverse();
  const labels = recent.map((r) =>
    new Date(r.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  );

  // ── Results trend ────────────────────────────────────────────────────────
  const resultsTrendData = {
    labels,
    datasets: [
      {
        label: "Passed",
        data: recent.map((r) => r.totals.passed),
        borderColor: `${CHART_COLORS.green}1)`,
        backgroundColor: `${CHART_COLORS.green}0.12)`,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
      },
      {
        label: "Failed",
        data: recent.map((r) => r.totals.failed),
        borderColor: `${CHART_COLORS.red}1)`,
        backgroundColor: `${CHART_COLORS.red}0.12)`,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
      },
      {
        label: "Skipped",
        data: recent.map((r) => r.totals.skipped),
        borderColor: `${CHART_COLORS.yellow}1)`,
        backgroundColor: `${CHART_COLORS.yellow}0.08)`,
        fill: false,
        tension: 0.4,
        borderDash: [4, 4],
        pointRadius: 2,
      },
      {
        label: "Flaky",
        data: recent.map((r) => r.totals.flaky),
        borderColor: `${CHART_COLORS.purple}1)`,
        backgroundColor: `${CHART_COLORS.purple}0.1)`,
        fill: false,
        tension: 0.4,
        borderDash: [2, 2],
        pointRadius: 2,
      },
    ],
  };

  // ── Duration trend ───────────────────────────────────────────────────────
  const durationTrendData = {
    labels,
    datasets: [
      {
        label: "Total (ms)",
        data: recent.map((r) => r.durations.totalMs),
        borderColor: `${CHART_COLORS.blue}1)`,
        backgroundColor: `${CHART_COLORS.blue}0.15)`,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        yAxisID: "y",
      },
      {
        label: "Avg per test (ms)",
        data: recent.map((r) => r.durations.avgTestMs),
        borderColor: `${CHART_COLORS.purple}1)`,
        backgroundColor: "transparent",
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        yAxisID: "y1",
      },
    ],
  };

  const durationOptions = {
    ...BASE_CHART_OPTIONS,
    scales: {
      ...BASE_CHART_OPTIONS.scales,
      y: {
        ...BASE_CHART_OPTIONS.scales.y,
        position: "left" as const,
        title: { display: true, text: "Total ms", color: "#5c6080", font: { size: 11 } },
      },
      y1: {
        position: "right" as const,
        ticks: { color: "#5c6080", font: { size: 11 } },
        grid: { drawOnChartArea: false, color: "rgba(46,49,80,0.6)" },
        title: { display: true, text: "Avg ms", color: "#5c6080", font: { size: 11 } },
      },
    },
  };

  // ── Pass rate trend (bar) ────────────────────────────────────────────────
  const passRateData = {
    labels,
    datasets: [
      {
        label: "Pass Rate %",
        data: recent.map((r) => r.passRate),
        backgroundColor: recent.map((r) =>
          r.passRate >= 95
            ? `${CHART_COLORS.green}0.7)`
            : r.passRate >= 75
            ? `${CHART_COLORS.yellow}0.7)`
            : `${CHART_COLORS.red}0.7)`
        ),
        borderRadius: 4,
      },
    ],
  };

  const passRateOptions = {
    ...BASE_CHART_OPTIONS,
    scales: {
      ...BASE_CHART_OPTIONS.scales,
      y: {
        ...BASE_CHART_OPTIONS.scales.y,
        min: 0,
        max: 100,
        ticks: {
          ...BASE_CHART_OPTIONS.scales.y.ticks,
          callback: (v: number | string) => `${v}%`,
        },
      },
    },
  };

  return (
    <div className="charts-grid">
      <div className="chart-panel">
        <h3>Results Trend (last {SPARKLINE_DAYS} runs)</h3>
        <Suspense fallback={<LoadingChart />}>
          <Line data={resultsTrendData} options={BASE_CHART_OPTIONS as never} />
        </Suspense>
      </div>

      <div className="chart-panel">
        <h3>Pass Rate % (last {SPARKLINE_DAYS} runs)</h3>
        <Suspense fallback={<LoadingChart />}>
          <Bar data={passRateData} options={passRateOptions as never} />
        </Suspense>
      </div>

      <div className="chart-panel" style={{ gridColumn: "1 / -1" }}>
        <h3>Duration Trend (last {SPARKLINE_DAYS} runs)</h3>
        <Suspense fallback={<LoadingChart />}>
          <Line data={durationTrendData} options={durationOptions as never} />
        </Suspense>
      </div>
    </div>
  );
}
