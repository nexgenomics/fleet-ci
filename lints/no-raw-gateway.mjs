// no-raw-gateway.mjs — enforce D-cac-1 (typed gateway client, inviolable). An app
// must reach the gateway ONLY through @nexgenomics/core's typed client
// (`@nexgenomics/core/api`, `useFabApi`), which injects the in-memory bearer and
// is pinned to a spec-parity'd schema. A raw fetch/axios/XHR to a `/v1…` path
// bypasses that client: it forfeits the typed surface and, worse, the auth
// injection (an un-authed or wrongly-authed call to a governed endpoint). This
// scans the app's own source for gateway-path string literals handed to a raw
// network call.
//
// Scope is deliberately tight to keep false-positives near zero: it matches a
// `/v1`-prefixed path literal that appears in the same expression as a known raw
// network call (fetch | axios(...) | axios.METHOD | new XMLHttpRequest /
// xhr.open). An app fetching its own non-gateway assets (which are never under
// /v1) does not match. core-pin + no-deep-imports are the companion guards that
// the client the app DOES use is the real pinned core, not a forked one.
//
// Usage:  node no-raw-gateway.mjs [app-dir]   (default: cwd)
// Scans <app-dir>/src. Exit 1 on any violation; exit 2 on a usage/IO error.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const APP = resolve(process.argv[2] || '.')

const SRC = join(APP, 'src')
if (!existsSync(SRC)) {
  console.error(`no-raw-gateway: ${SRC} not found`)
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

// A gateway path literal: `/v1` or `/v1/...` (also tolerate a leading scheme+host
// before /v1, e.g. "https://host/v1/..."). Quote-delimited or template literal.
const GW_PATH = String.raw`[\`'"](?:[a-zA-Z][\w+.-]*:\/\/[^\`'"]*)?\/v1(?:\/[^\`'"]*)?[\`'"]`
// A raw network caller appearing on the same line as such a literal.
const RAW_CALL = [
  // fetch('/v1...')  — bare or window.fetch; NOT a property like obj.refetch(
  String.raw`(?<![.\w])fetch\s*\(\s*${GW_PATH}`,
  // axios('/v1...') | axios.get('/v1...') | axios.request({ url: '/v1...' })
  String.raw`axios\s*(?:\.\s*\w+\s*)?\(\s*(?:\{[^}]*url\s*:\s*)?${GW_PATH}`,
  // new XMLHttpRequest paired with .open(..., '/v1...')
  String.raw`\.open\s*\(\s*[\`'"][A-Z]+[\`'"]\s*,\s*${GW_PATH}`,
]
const RE = new RegExp(RAW_CALL.join('|'))

const violations = []
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (RE.test(line)) violations.push({ file, line: i + 1, text: line.trim().slice(0, 100) })
  })
}

if (violations.length > 0) {
  console.error('no-raw-gateway: FAIL — raw network call to a gateway /v1 path (D-cac-1):')
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.text}`)
  console.error('no-raw-gateway: call the gateway only through @nexgenomics/core/api (useFabApi).')
  console.error('no-raw-gateway: a raw call bypasses the typed schema AND the in-memory bearer injection.')
  process.exit(1)
}
console.log('no-raw-gateway: OK — no raw /v1 calls; gateway access goes through core\'s typed client.')
