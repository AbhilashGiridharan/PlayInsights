/**
 * FailureAnalyticsSection.tsx - Compact tabbed card + modal drill-down
 * Layout: single card with 7 tab buttons. Clicking a row opens a detail modal.
 */

import { useEffect, useState } from "react";

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
interface Props { dataUrl: string; className?: string }

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

// -- Colors for breakdown bar --
const D_COLORS = ["#7c3aed", "#2563eb", "#0d9488", "#d97706", "#dc2626", "#16a34a"];

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
      <div className="fa2-rows">
        {items.map((e, i) => (
          <div key={i} className="fa2-row" onClick={() => setModal(e)}
            role="button" tabIndex={0} onKeyDown={k => k.key === "Enter" && setModal(e)}>
            <Pill label={e.errorType} cls="fa2-sev-critical" />
            <span className="fa2-row-main" title={e.testId}>{e.testId}</span>
            <span className="fa2-row-sub">{e.suite}</span>
            <span className="fa2-row-badge">{e.occurrences}x</span>
            <span className="fa2-row-hint">View &rarr;</span>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title="Error Context" onClose={() => setModal(null)}>
          <div className="fa2-modal-section">
            <div className="fa2-modal-kv"><span>Test</span><span>{modal.testId}</span></div>
            <div className="fa2-modal-kv"><span>Suite</span><span>{modal.suite}</span></div>
            <div className="fa2-modal-kv"><span>Type</span><Pill label={modal.errorType} cls="fa2-sev-critical" /></div>
            <div className="fa2-modal-kv"><span>Step</span><em>{modal.failedStep}</em></div>
            <div className="fa2-modal-kv"><span>File</span><code>{modal.file}{modal.line ? `:${modal.line}` : ""}</code></div>
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
                  style={{ width: `${(r.count / total) * 100}%`, background: D_COLORS[i % D_COLORS.length] }}
                  title={`${r.type}: ${r.count}`} />
              ))}
            </div>
            <div className="fa2-rca-sum-items">
              {rootCauses.map((r, i) => (
                <span key={i} className="fa2-rca-sum-item">
                  <span className="fa2-rca-sum-dot" style={{ background: D_COLORS[i % D_COLORS.length] }} />
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

// == MAIN COMPONENT ==
export function FailureAnalyticsSection({ dataUrl, className }: Props) {
  const [data,    setData]    = useState<AnalysisPayload | null>(null);
  const [err,     setErr]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState("errors");

  useEffect(() => {
    setLoading(true); setErr(null);
    fetch(dataUrl, { cache: "no-cache" })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json() as Promise<AnalysisPayload>; })
      .then(setData)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [dataUrl]);

  if (loading) return <Skeleton />;
  if (err)     return <div className="fa2-load-error">Failed to load analysis: {err}</div>;
  if (!data)   return null;

  const {
    summary, coverage, rootCauses,
    errorContext = [], rca = [], failureMapping = [],
    codeFixes = [], suggestedImprovements = [],
    impactAssessment, actionItems = [],
  } = data;

  const openActions = actionItems.filter(a => a.status === "Open").length;

  const riskColor = impactAssessment
    ? impactAssessment.overallRisk === "Critical" ? "var(--accent-red)"
    : impactAssessment.overallRisk === "High"     ? "var(--accent-yellow)"
    : impactAssessment.overallRisk === "Medium"   ? "var(--accent-blue)"
    : "var(--accent-green)"
    : undefined;

  const kpis = [
    { label: "Total Failures",  value: String(summary.failures),    color: "var(--accent-red)",    sub: "tests failed" },
    { label: "Failure Rate",    value: fmtPct(summary.failureRate), color: summary.failureRate > 10 ? "var(--accent-red)" : "var(--accent-yellow)", sub: "of all tests" },
    { label: "New Failures",    value: String(summary.newFailures), color: "var(--accent-yellow)", sub: "newly introduced" },
    { label: "Flaky Tests",     value: String(summary.flakyTests),  color: "var(--accent-purple)", sub: "intermittent" },
    { label: "Open Actions",    value: String(openActions),         color: "var(--accent-blue)",   sub: `of ${actionItems.length} total` },
    ...(impactAssessment ? [{ label: "Overall Risk", value: impactAssessment.overallRisk, color: riskColor ?? "var(--text-muted)", sub: impactAssessment.estimatedFixTime }] : []),
  ];

  return (
    <div className={clx("fa2-root", className)}>

      {/* Summary Panel */}
      <div className="fa2-summary-panel">
        <div className="fa2-summary-header">
          <span className="fa2-summary-title">Failure Analysis Summary</span>
          <span className="fa2-summary-meta">Generated {timeAgo(data.generatedAt)}</span>
        </div>
        <div className="fa2-kpi-grid">
          {kpis.map(k => (
            <div key={k.label} className="fa2-kpi-card" style={{ borderLeft: `3px solid ${k.color}` }}>
              <span className="fa2-kpi-lbl">{k.label}</span>
              <span className="fa2-kpi-val" style={{ color: k.color }}>{k.value}</span>
              <span className="fa2-kpi-sub">{k.sub}</span>
            </div>
          ))}
          {coverage && (
            <div className="fa2-kpi-card" style={{ borderLeft: "3px solid var(--accent-green)" }}>
              <span className="fa2-kpi-lbl">Tests Run</span>
              <span className="fa2-kpi-val" style={{ color: "var(--accent-green)" }}>{coverage.executed}<span className="fa2-kpi-of">/{coverage.totalTests}</span></span>
              <span className="fa2-kpi-sub">executed</span>
            </div>
          )}
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
            </button>
          ))}
        </div>

        <div className="fa2-panel" role="tabpanel">
          {tab === "errors"       && <TabErrors      items={errorContext} />}
          {tab === "rca"          && <TabRCA         items={rca} rootCauses={rootCauses} />}
          {tab === "mapping"      && <TabMapping     items={failureMapping} />}
          {tab === "fixes"        && <TabFixes       items={codeFixes} />}
          {tab === "improvements" && <TabImprovements items={suggestedImprovements} />}
          {tab === "impact"       && <TabImpact      data={impactAssessment} />}
          {tab === "actions"      && <TabActions     items={actionItems} />}
        </div>
      </div>

    </div>
  );
}
