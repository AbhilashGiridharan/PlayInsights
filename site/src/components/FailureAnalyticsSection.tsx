/**
 * FailureAnalyticsSection.tsx - Compact tabbed card + modal drill-down
 * Layout: single card with 7 tab buttons. Clicking a row opens a detail modal.
 *
 * Tab content comes from analysis.json when that file covers the selected run;
 * otherwise it is derived from the run's own per-scenario results.
 */

import { useEffect, useState } from "react";
import type { RunSummary, TestResult } from "../types";
import {
  categorize, categoryColor, diffRuns, errorHeadline, expectedReceived, failStreak, fmtRunLabel,
  groupByScenario, isPossibleDefect, previousRun, priorityOf, splitScenario, splitStory,
} from "../lib/insights";

// -- Types --
interface RootCause   { type: string; count: number }
interface ByComponent { name: string; failures: number }
interface FlakyTest   { testId: string; failRate: number; pattern: string; suggestedFix: string }
interface RecentFailure {
  runId: string; when: string; project: string; suite: string;
  testId: string; component: string; rootCause: string;
  error: string; suggestedFix: string; ciUrl: string; reportUrl: string;
}
interface ErrorContext {
  testId: string; suite: string; errorType: string;
  expected: string; received: string; failedStep: string;
  file: string; line?: number; occurrences: number;
  firstSeen: string; lastSeen: string;
  /** Full error output, when available */
  message?: string;
  /** Status in recent runs, oldest → newest (null = not run) */
  history?: Array<{ when: string; status: TestResult["status"] | null }>;
}
interface RCAEntry {
  rootCause: string; count: number; description: string;
  affectedTests: string[]; likelihood: "High" | "Medium" | "Low"; evidence: string;
}
interface FailureMapping {
  area: string; severity: "Critical" | "High" | "Medium" | "Low";
  failures: number; affectedTests: string[]; description: string;
}
interface CodeFix {
  testId: string; issue: string; currentCode: string;
  fixedCode: string; explanation: string; priority: "P1" | "P2" | "P3";
}
interface SuggestedImprovement {
  category: string; title: string; description: string;
  effort: "Low" | "Medium" | "High"; impact: "Low" | "Medium" | "High";
}
interface ImpactAssessment {
  overallRisk: "Critical" | "High" | "Medium" | "Low";
  affectedFeatures: string[]; testsBlocked: number;
  estimatedFixTime: string; businessImpact: string; regressionRisk: string;
}
interface ActionItem {
  priority: "P1" | "P2" | "P3"; title: string; description: string;
  owner: string; dueDate?: string; status: "Open" | "In Progress" | "Done";
}
interface AnalysisPayload {
  generatedAt: string;
  coverage?: { totalTests: number; executed: number };
  summary: { failures: number; failureRate: number; newFailures: number; flakyTests: number };
  rootCauses: RootCause[];
  byComponent: ByComponent[];
  flaky: FlakyTest[];
  recentFailures: RecentFailure[];
  errorContext?: ErrorContext[];
  rca?: RCAEntry[];
  failureMapping?: FailureMapping[];
  codeFixes?: CodeFix[];
  suggestedImprovements?: SuggestedImprovement[];
  impactAssessment?: ImpactAssessment;
  actionItems?: ActionItem[];
}
interface Props { dataUrl: string; runs: RunSummary[]; run: RunSummary; className?: string }

// -- Utils --
function clx(...a: (string | undefined | false)[]) { return a.filter(Boolean).join(" "); }
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}
function fmtPct(n: number) { return n.toFixed(1) + "%"; }

const SEV_CLS: Record<string, string> = {
  Critical: "fa2-sev-critical", High: "fa2-sev-high", Medium: "fa2-sev-med", Low: "fa2-sev-low",
};
const PRI_CLS: Record<string, string> = { P1: "fa2-pri-p1", P2: "fa2-pri-p2", P3: "fa2-pri-p3" };
const LIK_CLS: Record<string, string> = { High: "fa2-sev-high", Medium: "fa2-sev-med", Low: "fa2-sev-low" };
const STAT_CLS: Record<string, string> = {
  Open: "fa2-stat-open", "In Progress": "fa2-stat-wip", Done: "fa2-stat-done",
};
const RISK_CLS: Record<string, string> = {
  Critical: "fa2-risk-critical", High: "fa2-risk-high", Medium: "fa2-risk-med", Low: "fa2-risk-low",
};

function Pill({ label, cls }: { label: string; cls: string }) {
  return <span className={clx("fa2-pill", cls)}>{label}</span>;
}

const HISTORY_RUNS = 8;

function HistoryDots({ history }: { history: NonNullable<ErrorContext["history"]> }) {
  return (
    <span className="fa2-history" aria-label="Recent runs, oldest to newest">
      {history.map((h, i) => (
        <span key={i} className={`fa2-hdot ${h.status ?? "none"}`}
          title={`${fmtRunLabel(h.when)} — ${h.status ?? "not run"}`} />
      ))}
    </span>
  );
}

// -- Modal --
function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fa2-modal-backdrop" onClick={onClose}>
      <div className="fa2-modal-box" onClick={e => e.stopPropagation()}>
        <div className="fa2-modal-header">
          <span className="fa2-modal-title">{title}</span>
          <button className="fa2-modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <div className="fa2-modal-body">{children}</div>
      </div>
    </div>
  );
}

// -- Skeleton --
function Skeleton() {
  return (
    <div className="fa2-skeleton">
      <div className="skeleton" style={{ height: 40, borderRadius: 8, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 220, borderRadius: 8 }} />
    </div>
  );
}

// == TAB PANELS ==

// Tab 1: Errors
function TabErrors({ items }: { items: ErrorContext[] }) {
  const [modal, setModal] = useState<ErrorContext | null>(null);
  if (!items.length) return <div className="fa2-empty">No errors recorded in this window.</div>;
  return (
    <>
      <div className="fa2-err-list">
        {items.map((e, i) => {
          const sc = splitScenario(e.testId);
          const story = splitStory(e.suite);
          return (
            <div key={i} className="fa2-err" onClick={() => setModal(e)}
              role="button" tabIndex={0} onKeyDown={k => k.key === "Enter" && setModal(e)}>
              <span className="fa2-err-cause" style={{ background: categoryColor(e.errorType, i) }} aria-hidden="true" />
              <div className="fa2-err-body">
                <div className="fa2-err-head">
                  {sc.id && <span className="scenario-id">{sc.id}</span>}
                  <span className="fa2-err-title" title={e.testId}>{sc.title}</span>
                </div>
                <div className="fa2-err-meta">
                  <span className="fa2-err-type">{e.errorType}</span>
                  <span className="fa2-err-story" title={e.suite}>{story.id ?? story.title}</span>
                  {e.failedStep && e.failedStep !== "—" && <span className="fa2-err-step" title={e.failedStep}>at “{e.failedStep}”</span>}
                </div>
                {e.message && <code className="fa2-err-msg" title={e.message}>{errorHeadline(e.message)}</code>}
              </div>
              <div className="fa2-err-side">
                {e.history && <HistoryDots history={e.history} />}
                <span className="fa2-err-count">
                  {e.history ? `failed ${e.occurrences}/${e.history.filter(h => h.status).length} runs` : `${e.occurrences}x`}
                </span>
                <span className="fa2-row-hint">Details &rarr;</span>
              </div>
            </div>
          );
        })}
      </div>
      {modal && (
        <Modal title="Error Context" onClose={() => setModal(null)}>
          <div className="fa2-modal-section">
            <div className="fa2-modal-kv"><span>Test</span><span>{modal.testId}</span></div>
            <div className="fa2-modal-kv"><span>Suite</span><span>{modal.suite}</span></div>
            <div className="fa2-modal-kv"><span>Type</span><Pill label={modal.errorType} cls="fa2-sev-critical" /></div>
            <div className="fa2-modal-kv"><span>Step</span><em>{modal.failedStep}</em></div>
            {modal.file && <div className="fa2-modal-kv"><span>File</span><code>{modal.file}{modal.line ? `:${modal.line}` : ""}</code></div>}
            <div className="fa2-modal-kv"><span>Occurrences</span><span>{modal.occurrences}</span></div>
            <div className="fa2-modal-kv"><span>First seen</span><span>{timeAgo(modal.firstSeen)}</span></div>
            <div className="fa2-modal-kv"><span>Last seen</span><span>{timeAgo(modal.lastSeen)}</span></div>
          </div>
          <div className="fa2-modal-section">
            <div className="fa2-modal-sec-title">Expected vs Received</div>
            <div className="fa2-diff-row fa2-diff-expected">
              <span className="fa2-diff-pill fa2-diff-green">Expected</span>
              <code>{modal.expected}</code>
            </div>
            <div className="fa2-diff-vs">&ne;</div>
            <div className="fa2-diff-row fa2-diff-received">
              <span className="fa2-diff-pill fa2-diff-red">Received</span>
              <code>{modal.received}</code>
            </div>
          </div>
          {modal.message && (
            <div className="fa2-modal-section">
              <div className="fa2-modal-sec-title">Error output</div>
              <pre className="fa2-code-pre fa2-error-pre"><code>{modal.message}</code></pre>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

// Tab 2: RCA
function TabRCA({ items, rootCauses }: { items: RCAEntry[]; rootCauses: RootCause[] }) {
  const [modal, setModal] = useState<RCAEntry | null>(null);
  const total = rootCauses.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <>
      <div className="fa2-rca-panel">

        {/* Breakdown bar */}
        {rootCauses.length > 0 && (
          <div className="fa2-rca-summary">
            <span className="fa2-rca-sum-label">Breakdown</span>
            <div className="fa2-rca-bar">
              {rootCauses.map((r, i) => (
                <div key={i} className="fa2-rca-bar-seg"
                  style={{ width: `${(r.count / total) * 100}%`, background: categoryColor(r.type, i) }}
                  title={`${r.type}: ${r.count}`} />
              ))}
            </div>
            <div className="fa2-rca-sum-items">
              {rootCauses.map((r, i) => (
                <span key={i} className="fa2-rca-sum-item">
                  <span className="fa2-rca-sum-dot" style={{ background: categoryColor(r.type, i) }} />
                  {r.type}&nbsp;<strong>{r.count}</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* RCA Cards */}
        <div className="fa2-rca-cards">
          {items.length === 0 && <div className="fa2-empty">No RCA data.</div>}
          {items.map((r, i) => (
            <div key={i}
              className={clx("fa2-rca-card", `fa2-rca-card-${r.likelihood.toLowerCase()}`)}
              onClick={() => setModal(r)} role="button" tabIndex={0}
              onKeyDown={k => k.key === "Enter" && setModal(r)}>
              <div className="fa2-rca-card-head">
                <Pill label={r.likelihood} cls={LIK_CLS[r.likelihood]} />
                <span className="fa2-rca-card-title">{r.rootCause}</span>
                <span className="fa2-rca-card-count">{r.count} failure{r.count !== 1 ? "s" : ""}</span>
              </div>
              <p className="fa2-rca-card-desc">{r.description}</p>
              <div className="fa2-rca-card-evidence">&#128269; {r.evidence}</div>
              <div className="fa2-rca-card-foot">
                <div className="fa2-rca-tests">
                  {r.affectedTests.slice(0, 2).map((t, j) => (
                    <span key={j} className="fa2-rca-test-tag">{t}</span>
                  ))}
                  {r.affectedTests.length > 2 && (
                    <span className="fa2-rca-test-tag">+{r.affectedTests.length - 2} more</span>
                  )}
                </div>
                <span className="fa2-rca-card-link">View details &rarr;</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <Modal title="Root Cause Analysis" onClose={() => setModal(null)}>
          <div className="fa2-modal-section">
            <div className="fa2-modal-kv"><span>Root Cause</span><strong>{modal.rootCause}</strong></div>
            <div className="fa2-modal-kv"><span>Likelihood</span><Pill label={modal.likelihood} cls={LIK_CLS[modal.likelihood]} /></div>
            <div className="fa2-modal-kv"><span>Failures</span><span>{modal.count}</span></div>
          </div>
          <div className="fa2-modal-section">
            <div className="fa2-modal-sec-title">Description</div>
            <p className="fa2-modal-p">{modal.description}</p>
          </div>
          <div className="fa2-modal-section">
            <div className="fa2-modal-sec-title">Evidence</div>
            <p className="fa2-modal-p fa2-modal-evidence">{modal.evidence}</p>
          </div>
          {modal.affectedTests.length > 0 && (
            <div className="fa2-modal-section">
              <div className="fa2-modal-sec-title">Affected Tests</div>
              <div className="fa2-tag-wrap">
                {modal.affectedTests.map((t, i) => <span key={i} className="fa2-tag">{t}</span>)}
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

// Tab 3: Mapping
function TabMapping({ items }: { items: FailureMapping[] }) {
  const [modal, setModal] = useState<FailureMapping | null>(null);
  const max = Math.max(...items.map(m => m.failures), 1);
  if (!items.length) return <div className="fa2-empty">No failure mapping data.</div>;
  return (
    <>
      <div className="fa2-rows">
        {items.map((m, i) => (
          <div key={i} className="fa2-row" onClick={() => setModal(m)}
            role="button" tabIndex={0} onKeyDown={k => k.key === "Enter" && setModal(m)}>
            <Pill label={m.severity} cls={SEV_CLS[m.severity]} />
            <span className="fa2-row-main">{m.area}</span>
            <div className="fa2-minibar-wrap">
              <div className="fa2-minibar-fill" style={{
                width: `${(m.failures / max) * 100}%`,
                background: m.severity === "Critical" ? "var(--accent-red)"
                  : m.severity === "High" ? "var(--accent-yellow)" : "var(--accent-blue)",
              }} />
            </div>
            <span className="fa2-row-badge">{m.failures}</span>
            <span className="fa2-row-hint">View &rarr;</span>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title="Failure Mapping" onClose={() => setModal(null)}>
          <div className="fa2-modal-section">
            <div className="fa2-modal-kv"><span>Area</span><strong>{modal.area}</strong></div>
            <div className="fa2-modal-kv"><span>Severity</span><Pill label={modal.severity} cls={SEV_CLS[modal.severity]} /></div>
            <div className="fa2-modal-kv"><span>Failures</span><span>{modal.failures}</span></div>
          </div>
          <div className="fa2-modal-section">
            <div className="fa2-modal-sec-title">Description</div>
            <p className="fa2-modal-p">{modal.description}</p>
          </div>
          {modal.affectedTests.length > 0 && (
            <div className="fa2-modal-section">
              <div className="fa2-modal-sec-title">Affected Tests</div>
              <div className="fa2-tag-wrap">
                {modal.affectedTests.map((t, i) => <span key={i} className="fa2-tag">{t}</span>)}
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

// Tab 4: Fixes
function TabFixes({ items }: { items: CodeFix[] }) {
  const [modal, setModal] = useState<CodeFix | null>(null);
  if (!items.length) return <div className="fa2-empty">No code fixes yet.</div>;
  return (
    <>
      <div className="fa2-rows">
        {items.map((f, i) => (
          <div key={i} className="fa2-row" onClick={() => setModal(f)}
            role="button" tabIndex={0} onKeyDown={k => k.key === "Enter" && setModal(f)}>
            <Pill label={f.priority} cls={PRI_CLS[f.priority]} />
            <span className="fa2-row-main">{f.issue}</span>
            <span className="fa2-row-sub" title={f.testId}>{f.testId}</span>
            <span className="fa2-row-hint">Diff &rarr;</span>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title="Code Fix Suggestion" onClose={() => setModal(null)}>
          <div className="fa2-modal-section">
            <div className="fa2-modal-kv"><span>Priority</span><Pill label={modal.priority} cls={PRI_CLS[modal.priority]} /></div>
            <div className="fa2-modal-kv"><span>Issue</span><strong>{modal.issue}</strong></div>
            <div className="fa2-modal-kv"><span>Test</span><span>{modal.testId}</span></div>
          </div>
          <div className="fa2-modal-section">
            <div className="fa2-diff-grid">
              <div>
                <div className="fa2-code-label fa2-code-old">Current</div>
                <pre className="fa2-code-pre fa2-code-pre-old"><code>{modal.currentCode}</code></pre>
              </div>
              <div>
                <div className="fa2-code-label fa2-code-new">Fixed</div>
                <pre className="fa2-code-pre fa2-code-pre-new"><code>{modal.fixedCode}</code></pre>
              </div>
            </div>
          </div>
          <div className="fa2-modal-section fa2-modal-explain">
            <span>&#128161;</span>
            <p className="fa2-modal-p">{modal.explanation}</p>
          </div>
        </Modal>
      )}
    </>
  );
}

// Tab 5: Improvements
function TabImprovements({ items }: { items: SuggestedImprovement[] }) {
  const [modal, setModal] = useState<SuggestedImprovement | null>(null);
  if (!items.length) return <div className="fa2-empty">No improvements yet.</div>;
  const effortCls: Record<string, string> = { Low: "fa2-sev-low", Medium: "fa2-sev-med", High: "fa2-sev-high" };
  const impactCls: Record<string, string> = { Low: "fa2-tag-blue", Medium: "fa2-tag-purple", High: "fa2-tag-teal" };
  return (
    <>
      <div className="fa2-rows">
        {items.map((s, i) => (
          <div key={i} className="fa2-row" onClick={() => setModal(s)}
            role="button" tabIndex={0} onKeyDown={k => k.key === "Enter" && setModal(s)}>
            <span className="fa2-imp-cat">{s.category}</span>
            <span className="fa2-row-main">{s.title}</span>
            <Pill label={"E:" + s.effort} cls={effortCls[s.effort]} />
            <Pill label={"I:" + s.impact} cls={impactCls[s.impact]} />
            <span className="fa2-row-hint">View &rarr;</span>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title="Suggested Improvement" onClose={() => setModal(null)}>
          <div className="fa2-modal-section">
            <div className="fa2-modal-kv"><span>Category</span><span>{modal.category}</span></div>
            <div className="fa2-modal-kv"><span>Effort</span><Pill label={modal.effort} cls={effortCls[modal.effort]} /></div>
            <div className="fa2-modal-kv"><span>Impact</span><Pill label={modal.impact} cls={impactCls[modal.impact]} /></div>
          </div>
          <div className="fa2-modal-section">
            <div className="fa2-modal-sec-title">{modal.title}</div>
            <p className="fa2-modal-p">{modal.description}</p>
          </div>
        </Modal>
      )}
    </>
  );
}

// Tab 6: Impact
function TabImpact({ data }: { data: ImpactAssessment | undefined }) {
  if (!data) return <div className="fa2-empty">No impact data.</div>;
  return (
    <div className="fa2-impact-compact">
      <div className="fa2-impact-hero">
        <span className={clx("fa2-risk-pill", RISK_CLS[data.overallRisk])}>{data.overallRisk} Risk</span>
        <span className="fa2-impact-blocked">
          <span className="fa2-blocked-num">{data.testsBlocked}</span> blocked
        </span>
        <span className="fa2-impact-time">&#128336; {data.estimatedFixTime}</span>
      </div>
      <div className="fa2-impact-grid">
        <div className="fa2-impact-tile">
          <div className="fa2-tile-label">Business Impact</div>
          <div className="fa2-tile-val">{data.businessImpact}</div>
        </div>
        <div className="fa2-impact-tile">
          <div className="fa2-tile-label">Regression Risk</div>
          <div className="fa2-tile-val">{data.regressionRisk}</div>
        </div>
        <div className="fa2-impact-tile">
          <div className="fa2-tile-label">Features Affected</div>
          <div className="fa2-tag-wrap">
            {data.affectedFeatures.map((f, i) => <span key={i} className="fa2-feat-tag">{f}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// Tab 7: Actions
function TabActions({ items }: { items: ActionItem[] }) {
  const [modal, setModal] = useState<ActionItem | null>(null);
  if (!items.length) return <div className="fa2-empty">No action items.</div>;
  const done = items.filter(a => a.status === "Done").length;
  return (
    <>
      <div className="fa2-act-progress">
        <span className="fa2-act-prog-label">{done}/{items.length} resolved</span>
        <div className="fa2-act-prog-track">
          <div className="fa2-act-prog-fill" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </div>
      <div className="fa2-rows">
        {items.map((a, i) => (
          <div key={i} className={clx("fa2-row", a.status === "Done" && "fa2-act-done")}
            onClick={() => setModal(a)} role="button" tabIndex={0}
            onKeyDown={k => k.key === "Enter" && setModal(a)}>
            <Pill label={a.priority} cls={PRI_CLS[a.priority]} />
            <span className="fa2-row-main">{a.title}</span>
            <span className="fa2-row-sub">{a.owner}</span>
            <Pill label={a.status} cls={STAT_CLS[a.status]} />
            <span className="fa2-row-hint">View &rarr;</span>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title="Action Item" onClose={() => setModal(null)}>
          <div className="fa2-modal-section">
            <div className="fa2-modal-kv"><span>Priority</span><Pill label={modal.priority} cls={PRI_CLS[modal.priority]} /></div>
            <div className="fa2-modal-kv"><span>Status</span><Pill label={modal.status} cls={STAT_CLS[modal.status]} /></div>
            <div className="fa2-modal-kv"><span>Owner</span><span>{modal.owner}</span></div>
            {modal.dueDate && <div className="fa2-modal-kv"><span>Due</span><span>{modal.dueDate}</span></div>}
          </div>
          <div className="fa2-modal-section">
            <div className="fa2-modal-sec-title">{modal.title}</div>
            <p className="fa2-modal-p">{modal.description}</p>
          </div>
        </Modal>
      )}
    </>
  );
}

// == TABS CONFIG ==
const TABS = [
  { id: "errors",       label: "Errors"       },
  { id: "rca",          label: "RCA"          },
  { id: "mapping",      label: "Mapping"      },
  { id: "fixes",        label: "Fixes"        },
  { id: "improvements", label: "Improvements" },
  { id: "impact",       label: "Impact"       },
  { id: "actions",      label: "Actions"      },
];

// == DERIVED ANALYSIS (from run results) ==

const RANK = { Low: 0, Medium: 1, High: 2, Critical: 3 } as const;
type Level = keyof typeof RANK;
const LEVELS: Level[] = ["Low", "Medium", "High", "Critical"];

function severityOf(t: TestResult): Level {
  const base: Level = priorityOf(t) === "P1" ? "High" : priorityOf(t) === "P3" ? "Low" : "Medium";
  return isPossibleDefect(t) ? LEVELS[Math.min(3, RANK[base] + 1)] : base;
}

function deriveAnalysis(runs: RunSummary[], run: RunSummary) {
  const isAll = Boolean(run.aggregateOf);
  // Every failed execution (one per run in "all runs" mode) …
  const failedExec = (run.tests ?? []).filter(t => t.status === "failed");
  // … and one entry per failing scenario, keeping its most recent failure
  const failed = groupByScenario(failedExec).map(g => g.runs[0]);
  const prev = isAll ? null : previousRun(runs, run);
  const diff = diffRuns(prev, run);
  const t0 = new Date(run.timestamp).getTime();
  const history = runs.filter(r => new Date(r.timestamp).getTime() <= t0);

  const errorContext: ErrorContext[] = failed.map(t => {
    const failingRuns = history.filter(r => r.tests?.some(x => x.name === t.name && x.status === "failed"));
    const { expected, received } = expectedReceived(t.error);
    return {
      testId: t.name, suite: t.suite, errorType: categorize(t).label,
      expected, received, failedStep: t.failedStep ?? "—",
      file: t.file ?? "", line: t.line, occurrences: failingRuns.length,
      firstSeen: failingRuns[failingRuns.length - 1]?.timestamp ?? run.timestamp,
      lastSeen: failingRuns[0]?.timestamp ?? run.timestamp,
      message: t.error,
      history: history.slice(0, HISTORY_RUNS).reverse().map(r => ({
        when: r.timestamp,
        status: r.tests?.find(x => x.name === t.name)?.status ?? null,
      })),
    };
  });

  const byCat = new Map<string, { cat: ReturnType<typeof categorize>; tests: TestResult[] }>();
  for (const t of failedExec) {
    const cat = categorize(t);
    const g = byCat.get(cat.key) ?? { cat, tests: [] };
    g.tests.push(t);
    byCat.set(cat.key, g);
  }
  const groups = [...byCat.values()].sort((a, b) => b.tests.length - a.tests.length);
  const rootCauses: RootCause[] = groups.map(g => ({ type: g.cat.label, count: g.tests.length }));
  const rca: RCAEntry[] = groups.map(g => {
    const persistent = g.tests.filter(t => failStreak(runs, run, t.name) > 1).length;
    return {
      rootCause: g.cat.label, count: g.tests.length, description: g.cat.description,
      affectedTests: [...new Set(g.tests.map(t => t.name))],
      likelihood: g.cat.key === "defect" || persistent > 0 ? "High" : g.tests.length > 1 ? "Medium" : "Low",
      evidence: errorHeadline(g.tests[0].error) +
        (persistent
          ? isAll ? ` — ${persistent} of these are still failing in the latest runs.`
                  : ` — ${persistent} of these also failed in the previous run.`
          : ""),
    };
  });

  const byStory = new Map<string, TestResult[]>();
  failedExec.forEach(t => byStory.set(t.suite, [...(byStory.get(t.suite) ?? []), t]));
  const failureMapping: FailureMapping[] = [...byStory.entries()].map(([story, ts]) => {
    const total = run.tests!.filter(t => t.suite === story).length;
    return {
      area: story,
      severity: ts.map(severityOf).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "Low" as Level),
      failures: ts.length, affectedTests: [...new Set(ts.map(t => t.name))],
      description: `${ts.length} of ${total} scenario ${isAll ? "executions" : total > 1 ? "runs" : "run"} in this user story failed. ` +
        groupByScenario(ts).map(g => `${g.name}: ${g.runs[0].failedStep ?? errorHeadline(g.runs[0].error)}`).join(" · "),
    };
  }).sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.failures - a.failures);

  const suggestedImprovements: SuggestedImprovement[] = groups.map(g => ({
    category: g.cat.label, title: g.cat.improvement.title, description: g.cat.improvement.description,
    effort: g.cat.improvement.effort, impact: g.tests.length > 1 || g.cat.key === "defect" ? "High" : "Medium",
  }));

  const actionItems: ActionItem[] = failed.map((t): ActionItem => ({
    priority: priorityOf(t) ?? "P2",
    title: `${isPossibleDefect(t) ? "Confirm possible defect" : "Investigate failure"}: ${t.name}`,
    description: `${t.failedStep ? `Failed at “${t.failedStep}”. ` : ""}${errorHeadline(t.error)}`,
    owner: isPossibleDefect(t) ? "Product / Dev team" : "QA automation team",
    status: "Open",
  })).sort((a, b) => a.priority.localeCompare(b.priority));

  const p1Failed = failed.filter(t => priorityOf(t) === "P1").length;
  const overallRisk: Level =
    run.passRate < 50 ? "Critical" : p1Failed > 0 || run.passRate < 75 ? "High" : failed.length ? "Medium" : "Low";
  const storyTitles = [...byStory.keys()].map(n => splitStory(n).id ?? n);
  const impactAssessment: ImpactAssessment | undefined = failed.length ? {
    overallRisk,
    affectedFeatures: [...byStory.keys()].map(n => splitStory(n).title),
    testsBlocked: failed.length,
    estimatedFixTime: `${failed.length} scenario${failed.length > 1 ? "s" : ""} to triage`,
    businessImpact:
      `${byStory.size} user stor${byStory.size > 1 ? "ies have" : "y has"} failing acceptance scenarios (${storyTitles.join(", ")}). ` +
      (p1Failed ? `${p1Failed} failure${p1Failed > 1 ? "s are" : " is"} on P1 (critical) scenarios.` : "No P1 (critical) scenarios are failing."),
    regressionRisk: isAll
      ? (() => {
          const latest = new Map((runs[0]?.tests ?? []).map(t => [t.name, t.status]));
          const still = failed.filter(t => latest.get(t.name) === "failed").length;
          const recovered = failed.filter(t => latest.get(t.name) === "passed").length;
          return `${failed.length} scenario${failed.length > 1 ? "s have" : " has"} failed at least once: ${still} still failing in the latest run, ${recovered} passing again, ${failed.length - still - recovered} not run in the latest run.`;
        })()
      : prev
      ? `${diff.newFailures.length} new since the previous run, ${diff.persistent.length} carried over, ${diff.fixed.length} fixed.`
      : "No earlier run to compare against.",
  } : undefined;

  return {
    errorContext, rootCauses, rca, failureMapping, suggestedImprovements, actionItems,
    impactAssessment, newFailures: prev ? diff.newFailures.length : failed.length,
    // Failing scenarios that also failed before: carried over (single run) or failed in 2+ runs (all runs)
    recurring: isAll
      ? groupByScenario(failedExec).filter(g => g.runs.length > 1).length
      : prev ? diff.persistent.length : 0,
  };
}

// == MAIN COMPONENT ==
export function FailureAnalyticsSection({ dataUrl, runs, run, className }: Props) {
  const [data,    setData]    = useState<AnalysisPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState("errors");

  useEffect(() => {
    setLoading(true);
    fetch(dataUrl, { cache: "no-cache" })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json() as Promise<AnalysisPayload>; })
      .then(setData)
      // analysis.json is optional – the derived analysis covers every run
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [dataUrl]);

  if (loading) return <Skeleton />;

  // Use analysis.json only when it was generated for this run
  const external = data && data.recentFailures?.some(f => f.runId === run.runId) ? data : null;
  const derived  = deriveAnalysis(runs, run);
  const hasDetail = (run.tests?.length ?? 0) > 0;
  const isAll = Boolean(run.aggregateOf);

  const failures    = run.totals.failed;
  const executed    = run.totals.passed + run.totals.failed;
  const totalTests  = executed + run.totals.skipped;
  const failureRate = executed > 0 ? parseFloat(((failures / executed) * 100).toFixed(1)) : 0;
  const hasFailures = failures > 0;

  const failedIds = new Set((external?.recentFailures ?? []).filter(f => f.runId === run.runId).map(f => f.testId));
  const tabs = external ? {
    errors: (external.errorContext ?? []).filter(e => failedIds.has(e.testId)),
    rootCauses: external.rootCauses, rca: external.rca ?? [], mapping: external.failureMapping ?? [],
    fixes: external.codeFixes ?? [], improvements: external.suggestedImprovements ?? [],
    impact: external.impactAssessment, actions: external.actionItems ?? [],
    newFailures: external.summary.newFailures, recurring: null as number | null,
  } : {
    errors: derived.errorContext, rootCauses: derived.rootCauses, rca: derived.rca,
    mapping: derived.failureMapping, fixes: [] as CodeFix[], improvements: derived.suggestedImprovements,
    impact: derived.impactAssessment, actions: derived.actionItems, newFailures: derived.newFailures,
    recurring: derived.recurring as number | null,
  };

  const openActions = tabs.actions.filter(a => a.status === "Open").length;
  const risk = tabs.impact?.overallRisk;
  const unit = isAll ? "executions" : "scenarios";

  const causeTotal = tabs.rootCauses.reduce((n, r) => n + r.count, 0) || 1;
  const storyMax = Math.max(1, ...tabs.mapping.map(m => m.failures));

  const tiles = [
    isAll
      ? { label: "Scenarios affected", value: String(tabs.newFailures), sub: "failed at least once" }
      : { label: "New failures", value: String(tabs.newFailures), sub: "since previous run" },
    ...(tabs.recurring !== null
      ? [{ label: "Recurring", value: String(tabs.recurring), sub: isAll ? "failed in 2+ runs" : "also failed last run" }]
      : []),
    { label: "Flaky", value: String(run.totals.flaky), sub: "passed on retry" },
    { label: "Open actions", value: String(openActions), sub: `of ${tabs.actions.length} total` },
    { label: "Tests run", value: `${executed}/${totalTests}`, sub: "executed" },
  ];

  const counts: Record<string, number> = {
    errors: tabs.errors.length, rca: tabs.rca.length, mapping: tabs.mapping.length,
    fixes: tabs.fixes.length, improvements: tabs.improvements.length, actions: tabs.actions.length,
  };

  return (
    <div className={clx("fa2-root", className)}>

      {/* Overview */}
      <div className="fa3-overview">
        <div className="fa3-head">
          <h3>Failure overview</h3>
          <span className="fa2-source">
            {external ? `AI analysis · generated ${timeAgo(external.generatedAt)}`
              : isAll ? `Derived from ${run.aggregateOf} runs` : "Derived from run results"}
          </span>
        </div>

        <div className={clx("fa3-grid", !hasFailures && "fa3-grid-clean")}>
          <div className="fa3-headline">
            {hasFailures ? (
              <>
                <div className="fa3-big">
                  <span className="fa3-big-num">{failures}</span>
                  <span className="fa3-big-of">of {totalTests} {unit} failed</span>
                </div>
                <div className="fa3-rate">
                  <div className="fa3-rate-track"><span style={{ width: `${Math.min(100, failureRate)}%` }} /></div>
                  <span>{fmtPct(failureRate)} failure rate</span>
                </div>
                {risk && (
                  <div className="fa3-risk">
                    <span className={clx("fa2-risk-pill", RISK_CLS[risk])}>{risk} risk</span>
                    <span className="fa3-risk-note">{tabs.impact?.estimatedFixTime}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="fa3-clean">
                <span className="fa3-clean-icon" aria-hidden="true">✓</span>
                <div>
                  <div className="fa3-clean-title">No failures</div>
                  <div className="fa3-clean-sub">All {executed} executed {unit} passed.</div>
                </div>
              </div>
            )}
          </div>

          {hasFailures && (
            <div className="fa3-causes">
              <div className="fa3-col-title">What caused them</div>
              <div className="fa3-cause-bar" role="img"
                aria-label={tabs.rootCauses.map(r => `${r.type}: ${r.count}`).join(", ")}>
                {tabs.rootCauses.map((r, i) => (
                  <span key={r.type} style={{ width: `${(r.count / causeTotal) * 100}%`, background: categoryColor(r.type, i) }}
                    title={`${r.type}: ${r.count}`} />
                ))}
              </div>
              <ul className="fa3-legend">
                {tabs.rootCauses.map((r, i) => (
                  <li key={r.type}>
                    <i style={{ background: categoryColor(r.type, i) }} />
                    <span className="fa3-legend-label">{r.type}</span>
                    <b>{r.count}</b>
                    <span className="muted">{Math.round((r.count / causeTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasFailures && (
            <div className="fa3-stories">
              <div className="fa3-col-title">Where they happened</div>
              <ul>
                {tabs.mapping.slice(0, 5).map(m => {
                  const st = splitStory(m.area);
                  return (
                    <li key={m.area} title={m.area}>
                      <span className="fa3-story-name">
                        {st.id && <span className="story-id">{st.id}</span>}
                        <span className="fa3-story-title">{st.title}</span>
                      </span>
                      <span className="fa3-story-bar"><span style={{ width: `${(m.failures / storyMax) * 100}%` }} /></span>
                      <b className="num">{m.failures}</b>
                      <Pill label={m.severity} cls={SEV_CLS[m.severity]} />
                    </li>
                  );
                })}
                {tabs.mapping.length > 5 && (
                  <li className="fa3-more">
                    <button className="fa3-link" onClick={() => setTab("mapping")}>
                      +{tabs.mapping.length - 5} more stories &rarr;
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="fa3-tiles">
          {tiles.map(t => (
            <div key={t.label} className="fa3-tile">
              <span className="fa3-tile-label">{t.label}</span>
              <span className="fa3-tile-value">{t.value}</span>
              <span className="fa3-tile-sub">{t.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabbed Card */}
      <div className="fa2-card">
        <div className="fa2-tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id}
              className={clx("fa2-tab", tab === t.id && "fa2-tab-active")}
              onClick={() => setTab(t.id)}>
              {t.label}
              {hasFailures && counts[t.id] > 0 && <span className="fa2-tab-count">{counts[t.id]}</span>}
            </button>
          ))}
        </div>

        <div className="fa2-panel" role="tabpanel">
          {!hasFailures ? (
            <div className="fa2-empty fa2-no-failures">
              ✅ No failures in this run — all {executed} tests passed.
            </div>
          ) : !hasDetail && !external ? (
            <div className="fa2-empty">
              This run was recorded before per-scenario results were captured, so failure details are not available.
            </div>
          ) : (
            <>
              {tab === "errors"       && <TabErrors       items={tabs.errors} />}
              {tab === "rca"          && <TabRCA          items={tabs.rca} rootCauses={tabs.rootCauses} />}
              {tab === "mapping"      && <TabMapping      items={tabs.mapping} />}
              {tab === "fixes"        && (tabs.fixes.length > 0 || external
                ? <TabFixes items={tabs.fixes} />
                : <div className="fa2-empty">Code-level fix suggestions come from the AI analysis pipeline, and none have been generated for this run yet. See the Improvements and Actions tabs for guidance derived from the failures.</div>)}
              {tab === "improvements" && <TabImprovements items={tabs.improvements} />}
              {tab === "impact"       && <TabImpact       data={tabs.impact} />}
              {tab === "actions"      && <TabActions      items={tabs.actions} />}
            </>
          )}
        </div>
      </div>

    </div>
  );
}
