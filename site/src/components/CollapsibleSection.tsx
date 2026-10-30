/**
 * CollapsibleSection.tsx
 *
 * Section heading that expands/collapses its content. The open state is
 * remembered per viewer in localStorage; a short summary shows when collapsed.
 */

import { useState, type ReactNode } from "react";

interface Props {
  id: string;
  title: ReactNode;
  /** Shown next to the title while collapsed */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

const storageKey = (id: string) => `insights360_section_${id}`;

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(storageKey(id));
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function CollapsibleSection({ id, title, summary, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));

  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem(storageKey(id), o ? "0" : "1"); } catch { /* ignore */ }
      return !o;
    });
  };

  return (
    <>
      <div className="section-title" id={id}>
        <button
          className="section-toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`${id}-content`}
        >
          <span className={`section-caret${open ? " open" : ""}`} aria-hidden="true">▸</span>
          {title}
        </button>
        {!open && summary && <span className="section-sub section-summary">{summary}</span>}
      </div>
      <div id={`${id}-content`} hidden={!open}>
        {children}
      </div>
    </>
  );
}
