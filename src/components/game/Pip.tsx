export function PipPortrait({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="PIP the robot">
      <line x1="32" y1="10" x2="32" y2="3" stroke="#1e1b3a" strokeWidth="3" />
      <circle cx="32" cy="4" r="4" fill="#f43f5e" stroke="#1e1b3a" strokeWidth="2" className="pip-blink" />
      <rect x="8" y="10" width="48" height="40" rx="16" fill="#e0f2fe" stroke="#1e1b3a" strokeWidth="3" />
      <rect x="14" y="17" width="36" height="24" rx="10" fill="#1e1b3a" />
      <ellipse cx="25" cy="28" rx="4" ry="5" fill="#22d3ee" /><ellipse cx="39" cy="28" rx="4" ry="5" fill="#22d3ee" />
      <path d="M26 35 Q32 39 38 35" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="20" y="50" width="24" height="10" rx="4" fill="#ff8a1f" stroke="#1e1b3a" strokeWidth="3" />
    </svg>
  );
}
