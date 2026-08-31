import { Link } from 'react-router-dom'
import { people } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import { Avatar, Button, Section } from '../components/Primitives.jsx'

export default function People() {
  return (
    <>
      <TopBar title="People" back backTo="/horoscope" />

      <Section label={`${people.length} charts on file`}>
        <ul>
          {people.map((p) => (
            <li key={p.id}>
              <Link
                to={`/people/${p.id}`}
                className="flex items-center gap-4 border-b border-rule py-4 transition-opacity hover:opacity-60"
              >
                <Avatar initials={p.initials} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-t1">{p.name}</span>
                  <span className="mt-1 block truncate text-meta text-t3">
                    {p.sun} · {p.moon} · {p.rising}
                  </span>
                </span>
                <span className="flex-none text-right">
                  <span className="block text-body text-t1 tnum">{p.score}</span>
                  <span className="block text-micro uppercase tracking-caps text-t3">Fit</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-meta text-t3">
          Fit is a single number for a thing that is not one number. Open a person for the four axes
          it is made of.
        </p>
      </Section>

      <Section label="Add someone" last>
        <p className="prose-c mb-8">
          You need their birth time. Not roughly. If they do not know it, the reading will be
          confidently wrong.
        </p>
        <Button to="/people/invite" variant="solid">
          Invite by link
        </Button>
      </Section>

      <div className="h-8" />
    </>
  )
}
