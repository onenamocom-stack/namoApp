import { reports } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { rupees, useStore } from '../store.jsx'

/**
 * Reports — the paid long-form artefacts.
 *
 * Reachable from both Profile and Consult, since it is the thing a consult
 * converts into and the thing a profile owner comes back for.
 */
export default function Reports() {
  const { showToast, buyNow, spending, balance } = useStore()

  return (
    <>
      {/* No cart here since phase 10: the cart ships parcels, and a report
          is not one. Buy now stays on the wallet path until reports can be
          generated (HANDOFF §6, the vendor's two a month). */}
      <TopBar title="Reports" back backTo="/profile" sub={`${reports.length} available`} />

      <section className="border-b border-rule px-5 py-6">
        <p className="font-display text-title leading-tight t-heading">
          Written once, properly.
        </p>
        <p className="mt-3 text-meta t-body">
          A session is an hour and a memory. A report is the same reading you can go back to in
          March, when you have forgotten what was said.
        </p>
        <p className="mt-4 caps-sm t-faint tnum">
          Wallet · {balance === null ? '—' : `₹${rupees(balance)}`}
        </p>
      </section>

      <section className="px-5 py-6">
        <Kicker>All reports</Kicker>

        <ul className="mt-4 space-y-4">
          {reports.map((r) => (
            <li key={r.id}>
              <PopCard raised={r.popular} className="overflow-hidden">
                <Plate seed={r.id} className="aspect-[16/9] w-full">
                  <span className="absolute left-3 top-3">
                    <PopTag tone={r.popular ? 'gold' : 'default'}>{r.tag}</PopTag>
                  </span>
                  {r.popular && (
                    <span className="caps-sm absolute right-3 top-3 rounded-full bg-gold-fill px-2.5 py-1 text-ink">
                      Most taken
                    </span>
                  )}
                </Plate>

                <div className="p-4">
                  <p className="text-body t-heading">{r.name}</p>
                  <p className="mt-2 text-meta t-body">{r.line}</p>

                  <ul className="mt-3">
                    {r.includes.map((i) => (
                      <li key={i} className="flex items-baseline gap-2 py-1">
                        <span className="flex-none caps-sm gold">—</span>
                        <span className="text-meta t-sub">{i}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex items-center gap-3 border-t border-stroke pt-3">
                    <span className="caps-sm t-faint tnum">{r.pages} pages</span>
                    <span className="caps-sm t-faint">·</span>
                    <span className="caps-sm t-faint tnum">{r.delivery}</span>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <p className="flex-1 text-lead gold tnum">
                      ₹{r.price.toLocaleString('en-IN')}
                    </p>
                    <PopButton
                      size="sm"
                      full={false}
                      variant="gold"
                      disabled={spending}
                      onClick={() => buyNow(r)}
                    >
                      Buy now
                    </PopButton>
                  </div>
                </div>
              </PopCard>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-meta t-faint">
          The wallet is charged for real. No report is generated — that is phase 10.
        </p>

        <PopButton size="sm" className="mt-6" onClick={() => showToast('Sample — prototype only')}>
          See a sample page
        </PopButton>
      </section>

      <div className="h-8" />
    </>
  )
}
