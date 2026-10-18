/**
 * The verified mark beside a name: a white tick in a blue circle. It was a
 * scalloped rosette until 13 Oct 2026 (Rahul: "need to be round").
 *
 * One tick, blue: a Pro's and Content step 2's only (Rahul, 17 Oct 2026).
 * From 16 to 17 Oct anybody holding any module carried it, Seller too;
 * from 13 to 16 Oct a Pro's was orange and a Creator's blue. `tone` is still accepted and ignored, so the
 * callers that pass it need not change.
 */
const BLUE = '#1d9bf0'

// eslint-disable-next-line no-unused-vars
export default function VerifiedMark({ size = 18, tone, className = '' }) {
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
      <circle cx="12" cy="12" r="10.5" fill={BLUE} />
      <path d="m7.6 12.3 3 3 5.8-6.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
