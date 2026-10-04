import { BackButton, useGoBack } from '../../components/Chrome.jsx'
import { Button } from '../../components/Primitives.jsx'

/**
 * One question per screen. Huge type, no progress bar, no illustration.
 *
 * The absence of a progress bar is deliberate: a bar turns three questions
 * into a form, and a form is something you rush. Without it each screen reads
 * as the only thing being asked.
 */
export default function QuestionFrame({
  question,
  hint,
  children,
  footnote,
  nextTo,
  nextLabel = 'Continue',
  canContinue = true,
  onNext,
}) {
  const goBack = useGoBack('/onboarding')

  return (
    <div className="flex min-h-full flex-col px-6 pb-10 pt-6">
      <BackButton onClick={goBack} className="self-start" />

      <div className="mt-16 animate-fade-rise">
        <h1 className="mx-auto max-w-[14ch] text-center text-display font-semibold">{question}</h1>
        {hint && <p className="prose-c mt-5">{hint}</p>}
      </div>

      <div className="mt-14">{children}</div>

      <div className="mt-auto pt-16">
        {footnote && (
          <p className="mx-auto mb-6 max-w-measure text-center text-meta text-t3">{footnote}</p>
        )}
        <Button
          to={canContinue && !onNext ? nextTo : undefined}
          onClick={onNext && canContinue ? onNext : undefined}
          variant="solid"
          disabled={!canContinue}
          aria-disabled={!canContinue}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  )
}

/**
 * The shared input look: no box, no fill. A wide-tracked centered value
 * sitting on a single hairline that turns white when focused.
 */
export function Slot({ value, onChange, placeholder, size = 4, inputMode = 'numeric', label, max }) {
  return (
    <label className="flex flex-col items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={max}
        aria-label={label}
        size={size}
        className="w-full border-b border-rule bg-transparent pb-3 text-center text-display font-semibold text-t1 tnum outline-none transition-colors placeholder:text-t4 focus:border-t1"
      />
      <span className="text-micro uppercase tracking-caps text-t3">{label}</span>
    </label>
  )
}
