/**
 * The verified mark beside a consultant's name (11 Oct 2026, Rahul): a
 * white tick on a blue rosette, as people know it from other apps. It is
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
      <path
        fill="#1d9bf0"
        d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3-2.6-1.9 1-3-1-3 2.6-1.9 1-3 3.2.1z"
      />
      <path d="m7.6 12.3 3 3 5.8-6.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
