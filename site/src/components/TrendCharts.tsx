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
  theme?: "dark" | "light";
}

const CHART_COLORS = {
  green: "rgba(74,222,128,",
  red: "rgba(248,113,113,",
  yellow: "rgba(251,191,36,",
  blue: "rgba(96,165,250,",
  purple: "rgba(167,139,250,",
};

function buildChartOptions(theme: "dark" | "light") {
  const d = theme === "dark";
  const tick  = d ? "#5c6080" : "#8890b0";
  const grid  = d ? "rgba(46,49,80,0.6)" : "rgba(209,213,228,0.8)";
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: { color: d ? "#9399b2" : "#4a5070", boxWidth: 12, padding: 16, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: d ? "#1a1d27" : "#ffffff",
        borderColor:     d ? "#2e3150" : "#d1d5e4",
        borderWidth: 1,
        titleColor: d ? "#e8eaf6" : "#1a1d2e",
        bodyColor:  d ? "#9399b2" : "#4a5070",
      },
    },
    scales: {
      x: {
        ticks: { color: tick, font: { size: 11 }, maxRotation: 45 },
        grid:  { color: grid },
      },
      y: {
        ticks: { color: tick, font: { size: 11 } },
        grid:  { color: grid },
      },
    },
  };
}

function LoadingChart() {
  return (
    <div
      className="skeleton"
      style={{ height: 200, borderRadius: "var(--radius-sm)" }}
    />
  );
}

export function TrendCharts({ runs, theme = "dark" }: TrendChartsProps) {
  const chartOptions = buildChartOptions(theme);
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
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        min: 0,
        max: 100,
        ticks: {
          ...chartOptions.scales.y.ticks,
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
          <Line data={resultsTrendData} options={chartOptions as never} />
        </Suspense>
      </div>

      <div className="chart-panel">
        <h3>Pass Rate % (last {SPARKLINE_DAYS} runs)</h3>
        <Suspense fallback={<LoadingChart />}>
          <Bar data={passRateData} options={passRateOptions as never} />
        </Suspense>
      </div>
    </div>
  );
}
