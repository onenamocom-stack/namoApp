import { premiumTiers } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import { Button, Section, Stub } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

export default function Premium() {
  const { showToast } = useStore()

  return (
    <>
      <TopBar title="Premium" back backTo="/profile" />

      <section className="section pt-14">
        <h1 className="mx-auto max-w-[13ch] text-center text-display font-semibold">
          Go deeper when you want to.
        </h1>
        <Stub className="my-8" />
        <p className="horoscope">
          Your daily reading stays free. Premium gives you the full reading, at length.
        </p>
      </section>

      {premiumTiers.map((t) => (
        <Section key={t.id} label={t.name}>
          <p className="horoscope">{t.line}</p>

          <ul className="mx-auto mt-8 max-w-[18rem]">
            {t.includes.map((i) => (
              <li
                key={i}
                className="flex items-baseline gap-3 border-b border-rule py-3 last:border-b-0"
              >
                <span className="text-meta text-t4">—</span>
                <span className="text-body text-t2">{i}</span>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-center text-lead font-semibold tnum">
            ₹{t.price}
            <span className="ml-2 text-micro uppercase tracking-caps text-t3">{t.unit}</span>
          </p>

          <Button className="mt-6" variant="solid" onClick={() => showToast(`${t.name} — added`)}>
            Get it
          </Button>
        </Section>
      ))}

      <Section label="The honest part" last>
        <p className="prose-c">
          None of this is a payment screen. It is a prototype, nothing is charged, and no report is
          generated.
        </p>
      </Section>

      <div className="h-8" />
    </>
  )
}
