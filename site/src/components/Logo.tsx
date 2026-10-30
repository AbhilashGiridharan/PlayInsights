/**
 * Logo.tsx
 *
 * Insights360 mark: a gradient tile holding a 360° orbit (open ring ending in
 * a bright node) around a check mark – continuous test insight at a glance.
 * Keep in sync with the favicon in index.html.
 */

interface Props {
  size?: number;
  title?: string;
}

export function LogoMark({ size = 36, title = "Insights360" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}>
      <defs>
        <linearGradient id="i360-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="i360-ring" x1="10" y1="40" x2="38" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#i360-bg)" />
      {/* 360° orbit: 320° arc from the node round to the top, gap at top-right */}
      <path
        d="M33.64 12.51 A15 15 0 1 1 24 9"
        fill="none" stroke="url(#i360-ring)" strokeWidth="3.4" strokeLinecap="round"
      />
      {/* Insight node at the end of the orbit */}
      <circle cx="33.64" cy="12.51" r="3.6" fill="#5eead4" />
      <circle cx="33.64" cy="12.51" r="3.6" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.2" />
      {/* Check mark */}
      <path
        d="M17 24.6 L22 29.4 L31 19.8"
        fill="none" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoWordmark() {
  return (
    <span className="logo-wordmark">
      Insights<span className="logo-360">360</span>
    </span>
  );
}
