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

// Every build gets an id, baked into the app AND written beside it as
// version.json (6 Oct 2026). The running app compares the two and reloads
// itself at the next screen change when a newer build is live — a tab left
// open across a deploy was running the old call screen against the new
// server, and hanging up every call. See src/lib/update.js.
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 12) || String(Date.now())

function versionFile() {
  return {
    name: 'namo-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

export default defineConfig(({ mode }) => ({
  base: process.env.DEPLOY_BASE || '/',
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5174 },
  build: {
    outDir: mode === 'pro' ? 'dist-pro' : 'dist',
  },
}))
