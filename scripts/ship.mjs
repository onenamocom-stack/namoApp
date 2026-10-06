#!/usr/bin/env node
/**
 * Ship the web apps to Firebase Hosting (6 Oct 2026). Replaces the GitHub
 * Actions deploy: nothing about putting the apps online depends on GitHub.
 * The domain stays at GoDaddy; Firebase serves it (firebase.json,
 * .firebaserc — sites namo-web and namo-pro in the API's own Google project).
 *
 *   npm run ship            both apps: 1namo.com and pro.1namo.com
 *   npm run ship -- web     the seeker app only
 *   npm run ship -- pro     the consultant app only
 *   npm run ship -- --dirty allow uncommitted changes (a hotfix you will commit)
 *
 * What it does, in order, stopping at the first failure:
 *   1. refuses uncommitted changes (a live site must be a commit you can
 *      name), unless --dirty;
 *   2. checks the build env (.env.local): the three VITE_ values present,
 *      the API URL ending in /v1;
 *   3. lint, then build;
 *   4. deploys with the Firebase CLI, the commit in the release message.
 *
 * Credentials: the Firebase CLI's own login on this machine
 * (`npx.cmd firebase-tools login`, once, as the Google account that owns
 * the project). Nothing is stored in this repo.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APPS = {
  web: { build: 'npm run build', domain: '1namo.com', site: 'namo-web' },
  pro: { build: 'npm run build:pro', domain: 'pro.1namo.com', site: 'namo-pro' },
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
function run(cmd) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
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
const subject = execSync('git log -1 --format=%s', { cwd: ROOT }).toString().trim()

// 2. the build env
const vite = { ...readEnvFile('.env.local'), ...process.env }
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_DJANGO_API_URL']) {
  if (!vite[key]) fail(`${key} is missing from .env.local.`)
}
if (!/\/v1$/.test(vite.VITE_DJANGO_API_URL)) fail('VITE_DJANGO_API_URL must end in /v1.')

// 3. lint once, then each build
run('npm run lint')
for (const t of targets) run(APPS[t].build)

// 4. deploy
const message = `${sha}${status ? ' (dirty)' : ''} ${subject}`.slice(0, 250).replace(/"/g, "'")
const only_ = targets.map((t) => `hosting:${t}`).join(',')
run(`npx --no-install firebase deploy --only ${only_} --message "${message}" --non-interactive`)
for (const t of targets) console.log(`✓ ${t}: ${APPS[t].domain} (and ${APPS[t].site}.web.app) now serves ${sha}`)
