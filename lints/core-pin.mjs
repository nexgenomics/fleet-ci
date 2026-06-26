// core-pin.mjs — enforce D-cac-1: an app must pin @nexgenomics/core at an EXACT
// published version (x.y.z), never float, alias, or re-vendor it. Floating
// (`*`, `^`, `~`, ranges) defeats the deliberate-upgrade model (L3/L11);
// file:/link:/workspace:/git: are re-vendoring or forking — the "fleet drifts,
// one regression becomes a breach" failure the whole program exists to prevent.
//
// Usage:  node core-pin.mjs [app-dir]   (default: cwd)
// Reads <app-dir>/package.json. Exit 1 if the core dependency is not an exact pin.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const APP = resolve(process.argv[2] || '.')
const SCOPE = '@nexgenomics/core'
const pkgPath = join(APP, 'package.json')
if (!existsSync(pkgPath)) {
  console.error(`core-pin: ${pkgPath} not found`)
  process.exit(2)
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

// Collect the core spec from any dependency bucket.
const buckets = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
let spec = null
let where = null
for (const b of buckets) {
  if (pkg[b] && pkg[b][SCOPE] != null) { spec = pkg[b][SCOPE]; where = b; break }
}

if (spec == null) {
  console.error(`core-pin: FAIL — ${SCOPE} is not a declared dependency. An app MUST depend on the published core.`)
  process.exit(1)
}

// Exact semver only: x.y.z with optional -prerelease / +build. No range chars.
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const reason = (() => {
  if (EXACT.test(spec)) return null
  if (spec === '*' || spec === 'latest' || spec === 'x') return 'a floating wildcard'
  if (/^(file:|link:|portal:)/.test(spec)) return 're-vendoring via a local path (file:/link:)'
  if (/^workspace:/.test(spec)) return 'a workspace protocol (this app is not a workspace member)'
  if (/^(git\+|git:|https?:|github:)/.test(spec)) return 'a git/url source (a fork, not the published package)'
  if (/^npm:/.test(spec)) return 'an npm: alias (must be the real package)'
  if (/[\^~><=|\s-]/.test(spec) || /\.x/.test(spec)) return 'a version range (must be an exact x.y.z pin)'
  return 'not an exact x.y.z version'
})()

if (reason) {
  console.error(`core-pin: FAIL — ${where}["${SCOPE}"] = "${spec}" is ${reason}.`)
  console.error('core-pin: require an exact published version, e.g. "1.0.0".')
  process.exit(1)
}
console.log(`core-pin: OK — ${SCOPE} pinned at exact "${spec}" (${where}).`)
