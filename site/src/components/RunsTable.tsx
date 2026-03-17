import { useState, useMemo } from "react";
import type { RunSummary } from "../types";

interface RunsTableProps {
  runs: RunSummary[];
}

type SortKey = "timestamp" | "passRate" | "totals.passed" | "totals.failed" | "durations.totalMs";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

function StatusBadge({ passed, failed, skipped }: { passed: number; failed: number; skipped: number }) {
  if (failed > 0) return <span className="badge badge-red">FAIL</span>;
  if (passed === 0 && skipped > 0) return <span className="badge badge-gray">SKIP</span>;
  return <span className="badge badge-green">PASS</span>;
}

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function getSortValue(run: RunSummary, key: SortKey): number | string {
  switch (key) {
    case "timestamp": return run.timestamp;
    case "passRate": return run.passRate;
    case "totals.passed": return run.totals.passed;
    case "totals.failed": return run.totals.failed;
    case "durations.totalMs": return run.durations.totalMs;
    default: return "";
  }
}

export function RunsTable({ runs }: RunsTableProps) {
  const [project, setProject] = useState("All");
  const [suite, setSuite] = useState("All");
  const [status, setStatus] = useState("All");
  const [os, setOs] = useState("All");
  const [browser, setBrowser] = useState("All");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  // Derive filter options
  const allProjects = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((r) => r.projects.forEach((p) => set.add(p.name)));
    return ["All", ...Array.from(set).sort()];
  }, [runs]);

  const allSuites = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((r) => r.suites.forEach((s) => set.add(s.name)));
    return ["All", ...Array.from(set).sort()];
  }, [runs]);

  const allOs = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((r) => {
      const v = r.environment?.os;
      if (v) set.add(v);
    });
    return ["All", ...Array.from(set).sort()];
  }, [runs]);

  const allBrowsers = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((r) => {
      const v = r.environment?.browser;
      if (v) set.add(v);
    });
    return ["All", ...Array.from(set).sort()];
  }, [runs]);

  // Filter
  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (project !== "All" && !r.projects.some((p) => p.name === project)) return false;
      if (suite !== "All" && !r.suites.some((s) => s.name === suite)) return false;
      if (status === "Pass" && r.totals.failed > 0) return false;
      if (status === "Fail" && r.totals.failed === 0) return false;
      if (status === "Flaky" && r.totals.flaky === 0) return false;
      if (os !== "All" && r.environment?.os !== os) return false;
      if (browser !== "All" && r.environment?.browser !== browser) return false;
      if (search && !r.author.includes(search) && !r.runId.includes(search)) return false;
      return true;
    });
  }, [runs, project, suite, status, os, browser, search]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d: SortDir) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="table-panel">
      <div className="table-header-row">
        <h3>All Runs</h3>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {filtered.length} of {runs.length}
        </span>
      </div>

      {/* Filters */}
      <div className="filters-row" style={{ padding: "12px 20px" }}>
        <div className="filter-group">
          <label>Project</label>
          <select value={project} onChange={(e) => { setProject(e.target.value); setPage(1); }}>
            {allProjects.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Suite</label>
          <select value={suite} onChange={(e) => { setSuite(e.target.value); setPage(1); }}>
            {allSuites.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {["All", "Pass", "Fail", "Flaky"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>OS</label>
          <select value={os} onChange={(e) => { setOs(e.target.value); setPage(1); }}>
            {allOs.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Browser</label>
          <select value={browser} onChange={(e) => { setBrowser(e.target.value); setPage(1); }}>
            {allBrowsers.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Search</label>
          <input
            type="text"
            placeholder="author / run ID"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 180 }}
          />
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort("timestamp")}>Timestamp{sortIcon("timestamp")}</th>
              <th>Author</th>
              <th>OS</th>
              <th>Browser</th>
              <th>Playwright</th>
              <th>Status</th>
              <th onClick={() => handleSort("passRate")}>Pass Rate{sortIcon("passRate")}</th>
              <th onClick={() => handleSort("totals.passed")}>Passed{sortIcon("totals.passed")}</th>
              <th onClick={() => handleSort("totals.failed")}>Failed{sortIcon("totals.failed")}</th>
              <th>Skipped</th>
              <th>Flaky</th>
              <th onClick={() => handleSort("durations.totalMs")}>Duration{sortIcon("durations.totalMs")}</th>
              <th>Links</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={13} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                  No runs match the current filters.
                </td>
              </tr>
            )}
            {paginated.map((run) => (
              <tr key={run.runId}>
                <td className="mono">
                  {new Date(run.timestamp).toLocaleString("en-US", {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td>{run.author}</td>
                <td>
                  {run.environment?.os
                    ? <span className="badge badge-gray" title={`${run.environment.os} · ${run.environment.arch ?? ""}`}>
                        {run.environment.platform === "darwin" ? "macOS" : run.environment.os}
                      </span>
                    : <span className="badge badge-gray">—</span>}
                </td>
                <td>
                  {run.environment?.browser
                    ? <span className="badge badge-blue" title={run.environment.browser}>
                        {run.environment.browser.replace(" (Playwright-managed)", "")}
                      </span>
                    : <span className="badge badge-gray">—</span>}
                </td>
                <td className="mono" style={{ fontSize: 11 }}>
                  {run.environment?.playwright ?? "—"}
                </td>
                <td>
                  <StatusBadge
                    passed={run.totals.passed}
                    failed={run.totals.failed}
                    skipped={run.totals.skipped}
                  />
                </td>
                <td>
                  <span
                    style={{
                      color:
                        run.passRate >= 95
                          ? "var(--accent-green)"
                          : run.passRate >= 75
                          ? "var(--accent-yellow)"
                          : "var(--accent-red)",
                      fontWeight: 600,
                    }}
                  >
                    {run.passRate.toFixed(1)}%
                  </span>
                </td>
                <td style={{ color: "var(--accent-green)" }}>{run.totals.passed}</td>
                <td style={{ color: run.totals.failed > 0 ? "var(--accent-red)" : "var(--text-secondary)" }}>
                  {run.totals.failed}
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{run.totals.skipped}</td>
                <td style={{ color: run.totals.flaky > 0 ? "var(--accent-yellow)" : "var(--text-secondary)" }}>
                  {run.totals.flaky}
                </td>
                <td className="mono">{fmt(run.durations.totalMs)}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  {run.ciUrl && (
                    <a
                      href={run.ciUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm"
                      title="View CI Run"
                    >
                      CI
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button
          className="btn btn-sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          ← Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          className="btn btn-sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
