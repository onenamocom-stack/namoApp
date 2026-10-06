import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Both apps are served from the root of their own domains (1namo.com,
// pro.1namo.com) on Cloudflare Pages since 6 Oct 2026, so the asset base
// is '/'. DEPLOY_BASE remains for a build served under a sub-path.
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
// The commit, plus the time, so two builds of one commit (an env change)
// still differ.
function commit() {
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'nogit'
  }
}
const BUILD_ID = `${commit()}-${Date.now().toString(36)}`

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
