/**
 * The verified mark beside a consultant's name (11 Oct 2026, Rahul): a
 * white tick in a blue circle. It was a scalloped rosette until 13 Oct
 * 2026 (Rahul: "need to be round"). It is
 * the console's `verified`, nothing the consultant can set.
 */
/* Two ticks since 13 Oct 2026 (Rahul): orange for a Pro — every approved
   astrologer or expert — and blue for a Creator. */
const TONES = { pro: '#f5782c', creator: '#1d9bf0' }

export default function VerifiedMark({ size = 18, tone = 'pro', className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={tone === 'creator' ? 'Verified creator' : 'Verified'}
      className={`inline-block flex-none ${className}`}
    >
      <title>{tone === 'creator' ? 'Verified creator' : 'Verified'}</title>
      <circle cx="12" cy="12" r="10.5" fill={TONES[tone] ?? TONES.pro} />
      <path d="m7.6 12.3 3 3 5.8-6.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
