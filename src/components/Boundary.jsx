import { Component } from 'react'

/**
 * The last line before a white screen.
 *
 * This repo has no linter and no type checker, so an undefined identifier
 * inside JSX compiles green and throws at runtime — `backend/INSTRUCTIONS.md`
 * §2 records it shipping a blank page twice. Without a boundary React unmounts
 * the entire tree on any render throw, so one bad line in one screen takes the
 * tab bar, the router and every other screen with it, and the person sees
 * nothing at all and cannot navigate away.
 *
 * A class, because `componentDidCatch` has no hook equivalent. That is the only
 * reason there is a class in this codebase.
 *
 * What it deliberately does NOT do: retry, report to a service, or pretend the
 * screen still works. It says a screen broke, keeps the rest of the app usable,
 * and logs the real error where a developer will find it. A boundary that
 * swallows the error silently is worse than the white screen, because the white
 * screen at least gets reported.
 */
export default class Boundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // The only record there is. `console.error` is not observability, but it is
    // what a phone's remote debugger and a bug report can both reach.
    console.error('[boundary] screen crashed:', error, info?.componentStack)
  }

  /* Reset on navigation. Without this a crash on one screen persists after the
     person taps away to a working one, because the boundary has no idea the
     route changed — it just keeps rendering its own error state forever. */
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-full flex-col justify-center px-6 py-16 text-center">
        <p className="text-micro uppercase tracking-caps text-t3">This screen broke</p>
        <h1 className="mx-auto mt-5 max-w-[18ch] text-title font-light">
          Something here did not load.
        </h1>
        <p className="prose-c mt-6">
          The rest of the app still works. Go back and try another way in — and if it keeps
          happening, tell us what you tapped.
        </p>
        {/* A plain anchor, not a Link: the router is above this boundary but a
            crash inside a route can leave its context in a state where a soft
            navigation re-renders straight back into the throw. The hash reload
            is the one exit that always works. */}
        <a href="#/home" onClick={() => window.location.reload()} className="mt-10 text-body underline">
          Back to home
        </a>
      </div>
    )
  }
}
