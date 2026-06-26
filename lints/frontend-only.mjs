// frontend-only.mjs — enforce D-cac-4 (remit boundary). A customer app repo is a
// React/TypeScript SPA. Its data and control surface is the gateway: the posture
// is that an app should be able to get almost everything it needs through
// @nexgenomics/core's typed gateway client, and that custom compute belongs in
// the sanctioned tracks — agents running INSIDE the infra (the guest runtime /
// in-guest SDK) and backend white-label (the ISV track) — each with its OWN
// design pass. A backend service appearing in a *frontend* app repo is the smell
// of that work being smuggled in unscoped, around the design gate. This lint
// makes the boundary non-optional for the two clearest forms:
//
//   (1) Go anywhere in the repo (`*.go`, `go.mod`, `go.sum`) — the ISV /
//       host-side stack is Go; none of it belongs in an app SPA. HARD fail.
//   (2) A declared dependency on a known server framework — express, fastify,
//       koa, @hapi/hapi, @nestjs/core, restify. A customer SPA has no business
//       standing up an HTTP server. HARD fail.
//
// Deliberately NOT gated (the fuzzy residual, left to the contract's norm): a
// hand-rolled http server in a stray .mjs looks too much like legitimate dev
// tooling (Vite is itself a dev server) to gate without false alarms. The Go and
// known-framework signals are the high-confidence, zero-FP core of the boundary.
//
// Usage:  node frontend-only.mjs [app-dir]   (default: cwd)
// Exit 1 on any violation; exit 2 on a usage/IO error.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const APP = resolve(process.argv[2] || '.')
if (!existsSync(APP)) {
  console.error(`frontend-only: ${APP} not found`)
  process.exit(2)
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.staging', '.fleet-ci'])
const SERVER_FRAMEWORKS = new Set([
  'express',
  'fastify',
  'koa',
  '@hapi/hapi',
  'hapi',
  '@nestjs/core',
  'restify',
])

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const goViolations = []
for (const file of walk(APP)) {
  const base = file.split('/').pop()
  if (/\.go$/.test(base) || base === 'go.mod' || base === 'go.sum') {
    goViolations.push(file)
  }
}

const fwViolations = []
const pkgPath = join(APP, 'package.json')
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  for (const bucket of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const dep of Object.keys(pkg[bucket] || {})) {
      if (SERVER_FRAMEWORKS.has(dep)) fwViolations.push({ dep, bucket })
    }
  }
}

let failed = false
if (goViolations.length > 0) {
  failed = true
  console.error('frontend-only: FAIL — Go sources in a frontend app repo (D-cac-4):')
  for (const f of goViolations) console.error(`  ${f}`)
  console.error('frontend-only: backend/host-side compute is the ISV / agent track, not an app SPA — it needs its own design pass.')
}
if (fwViolations.length > 0) {
  failed = true
  console.error('frontend-only: FAIL — a server framework is declared (D-cac-4):')
  for (const v of fwViolations) console.error(`  ${v.bucket}["${v.dep}"]`)
  console.error('frontend-only: an app reaches the platform through the gateway (@nexgenomics/core/api); it does not run its own server.')
}

if (failed) process.exit(1)
console.log('frontend-only: OK — no Go sources and no server framework; this is a frontend app.')
