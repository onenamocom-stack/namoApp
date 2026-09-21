import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// The admin console (docs/02-TRD.md §7). A second app, not a route in the
// phone app: its own root, its own env files, its own port.
//
// Env lives in admin/, NOT the repo root, and the modes are `dev` and `prod`
// rather than Vite's development/production. A root `.env.production.local`
// would be picked up by a local `npm run build` of the PHONE app too, and a
// laptop build pointing at production is the 30 Aug incident with a new file.
//
//   npm run admin:dev   → admin/.env.dev.local
//   npm run admin:prod  → admin/.env.prod.local
const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: here,
  envDir: here,
  plugins: [react()],
  server: { port: 5270, strictPort: true },
})
