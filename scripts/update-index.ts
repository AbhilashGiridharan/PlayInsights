#!/usr/bin/env ts-node
/**
 * scripts/update-index.ts
 *
 * Scans data/runs/*.json and regenerates data/index.json –
 * an array of { filename, timestamp, runId } sorted newest-first.
 *
 * Safe to re-run; idempotent.
 */

import * as fs from "fs";
import * as path from "path";

interface IndexEntry {
  filename: string;
  timestamp: string;
  runId: string;
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const runsDir = path.join(repoRoot, "data", "runs");
  const indexFile = path.join(repoRoot, "data", "index.json");

  fs.mkdirSync(runsDir, { recursive: true });

  const files = fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const entries: IndexEntry[] = [];

  for (const filename of files) {
    const fullPath = path.join(runsDir, filename);
    try {
      const content = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      entries.push({
        filename,
        timestamp: content.timestamp ?? "",
        runId: content.runId ?? filename.replace(".json", ""),
      });
    } catch (err) {
      console.warn(`[update-index] ⚠️  Skipping malformed file: ${filename}`);
    }
  }

  // Sort newest first
  entries.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  fs.writeFileSync(indexFile, JSON.stringify(entries, null, 2), "utf8");
  console.log(
    `[update-index] ✅  Wrote data/index.json with ${entries.length} entr${
      entries.length === 1 ? "y" : "ies"
    }.`
  );
}

main();
