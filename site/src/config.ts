/**
 * site/src/config.ts
 *
 * Central configuration for the dashboard.
 * ─────────────────────────────────────────
 * DATA_BASE   – base URL for JSON data files.
 *               • In production (GitHub Pages) this points at the raw GitHub
 *                 content URL so the static site can fetch committed JSONs.
 *               • In local dev (`npm run dev` from /site) the Vite dev server
 *                 proxies relative paths, so we fall back to /data which maps
 *                 to the repo root's /data folder via the public/ symlink
 *                 (or you can copy /data into /site/public/data for local work).
 *
 * Override DATA_BASE at build time via VITE_DATA_BASE env var, e.g.:
 *   VITE_DATA_BASE=https://raw.githubusercontent.com/myorg/myrepo/main/data
 */

// ── Owner / repo / branch – edit these after forking ────────────────────────
export const GITHUB_OWNER = "owner";
export const GITHUB_REPO = "playwright-results-dashboard";
export const GITHUB_BRANCH = "main";

// ── Data base URL ────────────────────────────────────────────────────────────
const isLocalDev = import.meta.env.DEV;

export const DATA_BASE: string =
  (import.meta.env.VITE_DATA_BASE as string | undefined) ??
  (isLocalDev
    ? "/data"
    : `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data`);

// ── Auto-refresh ─────────────────────────────────────────────────────────────
const urlParams = new URLSearchParams(
  typeof window !== "undefined" ? window.location.search : ""
);
const refreshOverride = urlParams.get("refresh");

/** Milliseconds between automatic data refreshes. Pass ?refresh=60000 to override. */
export const AUTO_REFRESH_MS: number = refreshOverride
  ? parseInt(refreshOverride, 10)
  : 300_000; // 5 minutes

/** Stale data warning threshold (ms). Default: 24 hours. */
export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1_000;

/** Maximum number of recent runs to load (for performance). */
export const MAX_RUNS = 100;

/** Number of recent runs to show in sparklines. */
export const SPARKLINE_DAYS = 14;

/** Artifact HTML report URL template (GitHub Actions). */
export const artifactReportUrl = (_runId: string): string => {
  // _runId format: <shortSha>_<timestamp>
  // The CI URL is already stored on the run object; this is a convenience
  // helper in case you want to directly link to the artifact zip.
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`;
};
