// auth-posture.mjs — enforce D-cac-1 (auth posture, inviolable). The platform's
// auth posture — refresh-token rotation with an IN-MEMORY token cache and NO
// access token in localStorage — lives entirely in @nexgenomics/core's
// AuthProvider (cacheLocation="memory", useRefreshTokens). A consuming app gets
// that posture for free by wrapping itself in core's <AuthProvider>; it can only
// LOSE the posture by OWNING the provider or the token cache itself. This lint
// fences exactly those moves — and ONLY those, so that legitimate use of the
// Auth0 React hook (useAuth0() for loginWithRedirect / logout / isAuthenticated
// / user — which the canonical template relies on) is NOT penalised:
//
//   (1) HARD — the app stands up its OWN raw `Auth0Provider`. The provider is
//       where cacheLocation is chosen; an app rendering its own Auth0Provider can
//       silently pick the localStorage XSS surface. The one legitimate provider
//       is core's `AuthProvider` (a distinct symbol). Importing/rendering the raw
//       `Auth0Provider` is the breach.
//   (2) HARD — the app references `cacheLocation` anywhere. The app has no
//       business configuring the token cache; that is the in-memory posture and
//       it is core's to set. Any `cacheLocation` in app code is a re-wire attempt.
//   (3) TRIPWIRE — a token-shaped value written to local/sessionStorage in the
//       app's own code. A heuristic (it cannot see a token laundered through a
//       variable), labeled as one. Theme/UI-pref persistence is fine and is NOT
//       matched — only token-named writes are.
//
// What is deliberately ALLOWED: `import { useAuth0 } from '@auth0/auth0-react'`
// and using its action/state surface. The token never leaves core's in-memory
// cache by that path; the companion no-raw-gateway check fences raw token use
// against the gateway.
//
// Usage:  node auth-posture.mjs [app-dir]   (default: cwd)
// Scans <app-dir>/src. Exit 1 on any violation; exit 2 on a usage/IO error.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const APP = resolve(process.argv[2] || '.')

const SRC = join(APP, 'src')
if (!existsSync(SRC)) {
  console.error(`auth-posture: ${SRC} not found`)
  process.exit(2)
}

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(e)) out.push(p)
  }
  return out
}

// (1) the raw provider symbol. \b stops Auth0ProviderOptions (a type) matching.
const RAW_PROVIDER_RE = /\bAuth0Provider\b/
// (2) the token-cache location knob — only core's provider may set it.
const CACHE_LOCATION_RE = /\bcacheLocation\b/
// (3) (web|session)Storage write whose key/value names a token/bearer/jwt.
const TOKEN_STORE_RE =
  /(?:local|session)Storage\s*(?:\.\s*setItem\s*\(|\[)\s*[`'"][^`'"]*(?:token|bearer|jwt|access[_-]?token|id[_-]?token)[^`'"]*[`'"]/i

const providerHits = []
const cacheHits = []
const storeHits = []
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (RAW_PROVIDER_RE.test(line)) providerHits.push({ file, line: i + 1 })
    if (CACHE_LOCATION_RE.test(line)) cacheHits.push({ file, line: i + 1 })
    if (TOKEN_STORE_RE.test(line)) storeHits.push({ file, line: i + 1 })
  })
}

let failed = false
if (providerHits.length > 0) {
  failed = true
  console.error('auth-posture: FAIL — the app stands up its own raw Auth0Provider (D-cac-1):')
  for (const v of providerHits) console.error(`  ${v.file}:${v.line}`)
  console.error('auth-posture: wrap the app in core\'s <AuthProvider> (@nexgenomics/core/auth); do not own the provider.')
}
if (cacheHits.length > 0) {
  failed = true
  console.error('auth-posture: FAIL — the app configures cacheLocation (D-cac-1):')
  for (const v of cacheHits) console.error(`  ${v.file}:${v.line}`)
  console.error('auth-posture: the token cache is in-memory and is core\'s to set; the app must not configure it.')
}
if (storeHits.length > 0) {
  failed = true
  console.error('auth-posture: FAIL — a token-shaped value is written to web storage (D-cac-1 tripwire):')
  for (const v of storeHits) console.error(`  ${v.file}:${v.line}`)
  console.error('auth-posture: access tokens stay in memory (core posture); never persist them to local/sessionStorage.')
}

if (failed) process.exit(1)
console.log('auth-posture: OK — app does not own the auth provider or token cache; in-memory posture intact (useAuth0 hook use is fine).')
