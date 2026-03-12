import { lazy, Suspense } from "react";
import { useData } from "./hooks/useData";
import { useTheme } from "./hooks/useTheme";
import { SummaryCards } from "./components/SummaryCards";
import { DailySummary } from "./components/DailySummary";
import { STALE_THRESHOLD_MS } from "./config";

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
          <span>🔭</span>
          <span>Insights360</span>
        </div>
        <div className="header-actions">
          {lastFetchedAt && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Updated {lastFetchedAt.toLocaleTimeString()}
            </span>
          )}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e: { target: { checked: boolean } }) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: "var(--accent-purple)" }}
            />
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
            {/* Overview + Daily Summary – unified panel */}
            <div className="section-title">Overview</div>
            <div className="overview-layout">
              <div className="overview-main">
                <SummaryCards runs={runs} latest={latest} />
              </div>
              <div className="overview-aside">
                <div className="aside-header">
                  <span>📅</span>
                  <span>Summary of the Day</span>
                </div>
                <DailySummary runs={runs} />
              </div>
            </div>

            {/* Charts */}
            {runs.length > 0 && (
              <>
                <div className="section-title">Trends</div>
                <Suspense fallback={<LoadingSpinner />}>
                  <TrendCharts runs={runs} theme={theme} />
                </Suspense>
              </>
            )}

            {/* Runs Table */}
            <div className="section-title">Run History</div>
            <Suspense fallback={<LoadingSpinner />}>
              <RunsTable runs={runs} />
            </Suspense>
          </>
        )}
      </main>

      <footer className="footer">
        Insights360 — data served from{" "}
        <a
          href="https://raw.githubusercontent.com"
          target="_blank"
          rel="noreferrer"
        >
          raw.githubusercontent.com
        </a>
      </footer>
    </div>
  );
}

export default App;
