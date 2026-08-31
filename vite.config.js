import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served from the apex of its own domain (1namo.com) on GitHub
// Pages, so the asset base is '/'. It was `/${repo}/` while Pages served from
// github.io/<repo>/ — the move to a custom domain is what changed it.

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: { port: 5174 },
})
