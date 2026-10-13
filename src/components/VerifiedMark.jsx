/**
 * The verified mark beside a consultant's name (11 Oct 2026, Rahul): a
 * white tick in a blue circle. It was a scalloped rosette until 13 Oct
 * 2026 (Rahul: "need to be round"). It is
 * the console's `verified`, nothing the consultant can set.
 */
export default function VerifiedMark({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Verified"
      className={`inline-block flex-none ${className}`}
    >
      <title>Verified</title>
      <circle cx="12" cy="12" r="10.5" fill="#1d9bf0" />
      <path d="m7.6 12.3 3 3 5.8-6.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
