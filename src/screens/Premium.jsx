import { premiumTiers } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import { Button, Section, Stub } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

export default function Premium() {
  const { showToast, t } = useStore()

  return (
    <>
      <TopBar title={t('prof.premium')} back backTo="/profile" />

      <section className="section pt-14">
        <h1 className="mx-auto max-w-[13ch] text-center text-display font-semibold">
          {t('prem.title')}
        </h1>
        <Stub className="my-8" />
        <p className="horoscope">
          {t('prem.sub')}
        </p>
      </section>

      {premiumTiers.map((tier) => (
        <Section key={tier.id} label={tier.name}>
          <p className="horoscope">{tier.line}</p>

          <ul className="mx-auto mt-8 max-w-[18rem]">
            {tier.includes.map((i) => (
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
            ₹{tier.price}
            <span className="ml-2 text-micro uppercase tracking-caps text-t3">{tier.unit}</span>
          </p>

          <Button className="mt-6" variant="solid" onClick={() => showToast(t('prem.added', { name: tier.name }))}>
            {t('prem.get')}
          </Button>
        </Section>
      ))}

      <Section label={t('prem.honest')} last>
        <p className="prose-c">{t('prem.honestNote')}</p>
      </Section>

      <div className="h-8" />
    </>
  )
}
