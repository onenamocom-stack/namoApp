// Which app this build is. The side travels in the Vite mode: `vite --mode
// pro` builds the consultant app, anything else builds the seeker app.
// 'seeker' is the default so the existing build and deploy recipes keep
// producing exactly the app they produce today.
export const SIDE = import.meta.env.MODE === 'pro' ? 'pro' : 'seeker'
export const isPro = SIDE === 'pro'
