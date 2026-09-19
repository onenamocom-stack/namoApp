import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served from the apex of its own domain (1namo.com) on GitHub
// Pages, so the asset base is '/'. It was `/${repo}/` while Pages served from
// github.io/<repo>/ — the move to a custom domain is what changed it.
//
// Two apps, one codebase. The seeker app is the default build (`dist/`) and
// is what production deploys today; the consultant app builds with
// `--mode pro` into `dist-pro/` for a separate deployment. Nothing in the
// seeker build changes because the pro build exists.

export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [react()],
  server: { port: 5174 },
  build: {
    outDir: mode === 'pro' ? 'dist-pro' : 'dist',
  },
}))
