import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served from the apex of its own domain (1namo.com) on GitHub
// Pages, so the default asset base is '/'. Project-page deployments
// (onenamocom-stack.github.io/namoApp, /namo-pro) pass DEPLOY_BASE so the
// built HTML references /namoApp/assets/... instead of /assets/... —
// without it the page is a white screen while every asset 404s.
//
// Two apps, one codebase. The seeker app is the default build (`dist/`);
// the consultant app builds with `--mode pro` into `dist-pro/` for a
// separate deployment. Nothing in the seeker build changes because the pro
// build exists.

export default defineConfig(({ mode }) => ({
  base: process.env.DEPLOY_BASE || '/',
  plugins: [react()],
  server: { port: 5174 },
  build: {
    outDir: mode === 'pro' ? 'dist-pro' : 'dist',
  },
}))
