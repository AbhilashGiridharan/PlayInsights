/**
 * site/src/hooks/useData.ts
 *
 * Data loading hook with:
 * - localStorage caching
 * - exponential backoff retry
 * - auto-refresh
 * - stale data detection
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { DATA_BASE, AUTO_REFRESH_MS, MAX_RUNS, STALE_THRESHOLD_MS } from "../config";
import type { RunSummary, IndexEntry } from "../types";

const CACHE_KEY = "pw_dashboard_runs";
const CACHE_TTL_MS = 60_000; // 1 min cache validity

interface CacheEntry {
  data: RunSummary[];
  fetchedAt: number;
}

function readCache(): RunSummary[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(data: RunSummary[]): void {
  try {
    const entry: CacheEntry = { data, fetchedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore quota errors
  }
}

async function fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      // Exponential backoff: 500ms, 1000ms, 2000ms
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw new Error("Unreachable");
}

export interface UseDataReturn {
  runs: RunSummary[];
  latest: RunSummary | null;
  loading: boolean;
  error: string | null;
  isStale: boolean;
  lastFetchedAt: Date | null;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  refresh: () => void;
}

export function useData(): UseDataReturn {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [latest, setLatest] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Load last.json for the latest run card
      const lastRun = await fetchWithRetry<RunSummary>(`${DATA_BASE}/last.json`);
      setLatest(lastRun);

      // 2. Try cache first
      const cached = readCache();
      if (cached && cached.length > 0) {
        setRuns(cached);
        setLastFetchedAt(new Date());
        setLoading(false);
      }

      // 3. Load index
      const index = await fetchWithRetry<IndexEntry[]>(`${DATA_BASE}/index.json`);
      const recent = index.slice(0, MAX_RUNS);

      // 4. Fetch individual run files (parallel, up to 10 at a time)
      const CHUNK = 10;
      const fetched: RunSummary[] = [];
      for (let i = 0; i < recent.length; i += CHUNK) {
        const chunk = recent.slice(i, i + CHUNK);
        const results = await Promise.allSettled(
          chunk.map((entry) =>
            fetchWithRetry<RunSummary>(`${DATA_BASE}/runs/${entry.filename}`)
          )
        );
        for (const r of results) {
          if (r.status === "fulfilled") fetched.push(r.value);
        }
      }
      // Sort newest first
      fetched.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setRuns(fetched);
      writeCache(fetched);
      setLastFetchedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    timerRef.current = setInterval(fetchData, AUTO_REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, fetchData]);

  const isStale =
    lastFetchedAt !== null &&
    Date.now() - lastFetchedAt.getTime() > STALE_THRESHOLD_MS;

  return {
    runs,
    latest,
    loading,
    error,
    isStale,
    lastFetchedAt,
    autoRefresh,
    setAutoRefresh,
    refresh: fetchData,
  };
}
