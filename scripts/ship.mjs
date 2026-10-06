#!/usr/bin/env node
/**
 * Ship the web apps to Cloudflare Pages (6 Oct 2026). Replaces the GitHub
 * Actions deploy: nothing about putting the apps online depends on GitHub.
 *
 *   npm run ship            both apps: 1namo.com and pro.1namo.com
 *   npm run ship -- web     the seeker app only
 *   npm run ship -- pro     the consultant app only
 *   npm run ship -- --dirty allow uncommitted changes (a hotfix you will commit)
 *
 * What it does, in order, and it stops at the first failure:
 *   1. refuses uncommitted changes (a live site must be a commit you can
 *      name), unless --dirty;
 *   2. checks the build env (.env.local): the three VITE_ values present,
 *      the API URL ending in /v1 — the checks the old workflow made;
 *   3. lint, then build;
 *   4. uploads with wrangler to the Pages project, creating it the first
 *      time. The site is live when this prints its URL.
 *
 * Credentials: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, from the
 * environment or from `.env.deploy` beside this repo's package.json
 * (gitignored — never commit it). The token needs Account › Cloudflare
 * Pages › Edit.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APPS = {
  web: { project: 'namo-web', build: 'npm run build', dir: 'dist', domain: '1namo.com' },
  pro: { project: 'namo-pro', build: 'npm run build:pro', dir: 'dist-pro', domain: 'pro.1namo.com' },
}

const args = process.argv.slice(2)
const dirty = args.includes('--dirty')
const only = args.filter((a) => !a.startsWith('--'))
const targets = only.length ? only : Object.keys(APPS)
for (const t of targets) if (!APPS[t]) fail(`Unknown app "${t}". Use web, pro, or nothing for both.`)

function fail(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}
function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
}
function readEnvFile(name) {
  const path = join(ROOT, name)
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

// 1. a commit you can name
const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim()
if (status && !dirty) fail('Uncommitted changes. Commit first, or pass --dirty for a hotfix.')
const sha = execSync('git rev-parse --short=12 HEAD', { cwd: ROOT }).toString().trim()
const subject = execSync('git log -1 --format=%s', { cwd: ROOT }).toString().trim().slice(0, 300)

// 2. the build env
const vite = { ...readEnvFile('.env.local'), ...process.env }
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_DJANGO_API_URL']) {
  if (!vite[key]) fail(`${key} is missing from .env.local.`)
}
if (!/\/v1$/.test(vite.VITE_DJANGO_API_URL)) fail('VITE_DJANGO_API_URL must end in /v1.')

const deploy = { ...readEnvFile('.env.deploy'), ...process.env }
for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  if (!deploy[key]) fail(`${key} is not set. Put it in .env.deploy (gitignored) or the environment.`)
}
const env = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: deploy.CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: deploy.CLOUDFLARE_ACCOUNT_ID,
}

// 3. lint once, then each build
run('npm run lint')
for (const t of targets) run(APPS[t].build)

// 4. upload
for (const t of targets) {
  const app = APPS[t]
  const list = execSync('npx wrangler pages project list', { cwd: ROOT, env }).toString()
  if (!list.includes(app.project)) {
    run(`npx wrangler pages project create ${app.project} --production-branch=main`, { env })
  }
  run(
    `npx wrangler pages deploy ${app.dir} --project-name=${app.project} --branch=main ` +
      `--commit-hash=${sha} --commit-message=${JSON.stringify(subject)} --commit-dirty=${status ? 'true' : 'false'}`,
    { env },
  )
  console.log(`\n✓ ${t}: ${app.domain} (and ${app.project}.pages.dev) now serves ${sha}`)
}
