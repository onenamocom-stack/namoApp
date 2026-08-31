import { Button, Stub } from '../../components/Primitives.jsx'
import Plate from '../../components/Plate.jsx'

export default function Intro() {
  return (
    <div className="flex min-h-full flex-col px-6 pb-10 pt-16">
      <div className="animate-fade-slow text-center">
        <p className="text-micro uppercase tracking-caps text-t3">Namo</p>
        <Stub className="my-8" />
        <h1 className="mx-auto max-w-[12ch] text-huge font-light">
          Your chart is not a personality test.
        </h1>
        <p className="prose-c mt-8">
          It is a set of positions at one moment. What you do with them is a separate question, and
          this app is blunt about the difference.
        </p>
      </div>

      <Plate seed="intro-plate" variant="orbit" className="my-12 h-52 w-full animate-fade-slow" />

      <div className="mt-auto">
        <p className="label mb-6">Two ways in. Pick yours.</p>
        <Button to="/onboarding/side" variant="solid">
          Begin
        </Button>
        <p className="mt-6 text-center text-micro uppercase tracking-caps text-t3">
          Takes about a minute
        </p>
      </div>
    </div>
  )
}
