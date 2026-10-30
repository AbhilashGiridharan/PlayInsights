import { lazy, Suspense, useMemo, useState } from "react";
import { useData } from "./hooks/useData";
import { useTheme } from "./hooks/useTheme";
import { FailureAnalyticsSection } from "./components/FailureAnalyticsSection";
import { ExecutiveSummary } from "./components/ExecutiveSummary";
import { StoryCoverage } from "./components/StoryCoverage";
import { StabilityMatrix, SlowestScenarios } from "./components/StabilityMatrix";
import { ProgrammeHealth } from "./components/ProgrammeHealth";
import { STALE_THRESHOLD_MS, DATA_BASE } from "./config";
import { ALL_RUNS_ID, aggregateRuns, storiesOf } from "./lib/insights";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { LogoMark, LogoWordmark } from "./components/Logo";

// Code-split heavy chart components
const TrendCharts = lazy(() =>
  import("./components/TrendCharts").then((m) => ({ default: m.TrendCharts }))
);
const RunsTable = lazy(() =>
  import("./components/RunsTable").then((m) => ({ default: m.RunsTable }))
);

function LoadingSpinner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        color: "var(--text-muted)",
      }}
    >
      Loading…
    </div>
  );
}

function App() {
  const {
    runs,
    latest,
    loading,
    error,
    isStale,
    lastFetchedAt,
    autoRefresh,
    setAutoRefresh,
    refresh,
  } = useData();

  const { theme, toggleTheme } = useTheme();

  // null = follow the latest run; ALL_RUNS_ID = whole history; otherwise a picked run
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  const latestRunId = runs[0]?.runId ?? null;
  const allRuns = useMemo(() => (runs.length ? aggregateRuns(runs) : null), [runs]);
  const selectedRun = pickedRunId === ALL_RUNS_ID
    ? allRuns
    : runs.find((r) => r.runId === pickedRunId) ?? runs[0] ?? null;
  const selectRun = (runId: string) => {
    setPickedRunId(runId === latestRunId ? null : runId);
    document.getElementById("summary")?.scrollIntoView({ behavior: "smooth" });
  };

  const staleWarning =
    latest &&
    !isStale &&
    lastFetchedAt &&
    Date.now() - new Date(latest.timestamp).getTime() > STALE_THRESHOLD_MS;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-title">
          <span className="header-logo"><LogoMark size={36} /></span>
          <span className="header-name">
            <LogoWordmark />
            <small>Test automation report</small>
          </span>
        </div>
        <nav className="header-nav" aria-label="Sections">
          {runs.length > 0 && <a href="#health">Health</a>}
          <a href="#summary">Summary</a>
          <a href="#coverage">Coverage</a>
          <a href="#failure-analysis">Failures</a>
          {runs.length > 0 && <a href="#trends">Trends</a>}
          <a href="#run-history">History</a>
        </nav>
        <div className="header-actions">
          {lastFetchedAt && (
            <span className={`header-updated${error ? " is-error" : ""}`}>
              <span className="live-dot" />
              Updated {lastFetchedAt.toLocaleTimeString()}
            </span>
          )}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e: { target: { checked: boolean } }) => setAutoRefresh(e.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
            Auto-refresh
          </label>
          <button
            className="btn btn-sm btn-icon"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "↺ Refresh"}
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="main-content">
        {/* Error banner */}
        {error && (
          <div className="banner banner-error">
            ⚠ Failed to load data: {error}. Showing cached data if available.
          </div>
        )}

        {/* Stale data warning */}
        {staleWarning && (
          <div className="banner banner-warning">
            ⚠ The latest data is more than 24 hours old. CI may not have run recently.
          </div>
        )}

        {/* Info banner when no runs */}
        {!loading && !error && runs.length === 0 && (
          <div className="banner banner-info">
            ℹ No run data found. Push code and trigger a CI run, or add sample data to /data/runs/.
          </div>
        )}

        {/* Loading state */}
        {loading && runs.length === 0 ? (
          <div className="cards-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card skeleton" style={{ height: 110 }} />
            ))}
          </div>
        ) : (
          <>
            {/* Programme health across all runs */}
            {runs.length > 0 && (
              <>
                <div className="section-title" id="health">Programme Health <span className="section-sub">all runs</span></div>
                <ProgrammeHealth runs={runs} />
              </>
            )}

            {selectedRun && (
              <>
                {/* Executive summary for the selected run */}
                <div className="section-title" id="summary">Executive Summary</div>
                <ExecutiveSummary
                  runs={runs}
                  run={selectedRun}
                  latestRunId={latestRunId}
                  onSelectRun={selectRun}
                />

                {/* Requirement coverage */}
                <CollapsibleSection
                  id="coverage"
                  title="Requirement Coverage"
                  summary={(() => {
                    const stories = storiesOf(selectedRun);
                    const green = stories.filter((st) => st.failed === 0).length;
                    return selectedRun.aggregateOf
                      ? `${green}/${stories.length} user stories green in every run`
                      : `${green}/${stories.length} user stories passing`;
                  })()}
                >
                  <StoryCoverage run={selectedRun} />
                </CollapsibleSection>

                {/* Failure Analysis */}
                <div className="section-title" id="failure-analysis">Failure Analysis</div>
                <FailureAnalyticsSection dataUrl={`${DATA_BASE}/analysis.json`} runs={runs} run={selectedRun} />

                {/* Stability & trends */}
                <div className="section-title" id="trends">Stability &amp; Trends</div>
                <div className="stack">
                  <StabilityMatrix runs={runs} selectedRunId={selectedRun.runId} onSelectRun={selectRun} />
                  <Suspense fallback={<LoadingSpinner />}>
                    <TrendCharts runs={runs} theme={theme} selectedRunId={selectedRun.runId} />
                  </Suspense>
                  <SlowestScenarios run={selectedRun} />
                </div>
              </>
            )}

            {/* Runs Table */}
            <div className="section-title" id="run-history">Run History</div>
            <Suspense fallback={<LoadingSpinner />}>
              <RunsTable runs={runs} selectedRunId={selectedRun?.runId ?? null} onSelectRun={selectRun} />
            </Suspense>
          </>
        )}
      </main>

      <footer className="footer">
        Insights360 · Automated test report generated from Playwright BDD results
        {lastFetchedAt && <> · refreshed {lastFetchedAt.toLocaleString()}</>}
      </footer>
    </div>
  );
}

export default App;
