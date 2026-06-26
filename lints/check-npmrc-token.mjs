// check-npmrc-token.mjs — enforce L15 .npmrc hygiene: an app repo commits ONLY
// the registry-scope line and reads the auth token from an env var at install
// (`_authToken=${NODE_AUTH_TOKEN}`). A committed literal token is a long-lived
// secret in source — the isolation trap L5/L9 forbid. This is the committed-
// `_authToken` guard that pairs with check-no-secrets (which scans the built
// bundle); this one scans COMMITTED SOURCE before build.
//
// Usage:  node check-npmrc-token.mjs [app-dir]   (default: cwd)
// Scans .npmrc files and tracked text sources for a non-env `_authToken=` value.
// Exit 1 on any literal token.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const APP = resolve(process.argv[2] || '.')

// _authToken = <value>, where <value> is NOT an env-var expansion (${...}).
// Legit:   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
// Illegal: //npm.pkg.github.com/:_authToken=ghp_realtokenvalue...
const LITERAL_TOKEN = /_authToken\s*=\s*(?!\$\{)(\S+)/

// SKIP .fleet-ci: under the reusable CI workflow the app's CI checks out
// fleet-ci into ./.fleet-ci and runs `node .fleet-ci/lints/check-npmrc-token.mjs .`,
// so the scanned root contains this lint's OWN source — whose comments carry
// literal `_authToken=ghp_…` examples. Without this skip the lint self-flags
// (F-rag-8, found on the first live app-hello PR). .fleet-ci is the trusted,
// contractor-unwritable checkout, never app source, so excluding it loses no
// coverage. (frontend-only already skips it for the same reason.)
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.staging', '.fleet-ci'])
function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (/\.(npmrc|ts|tsx|js|jsx|mjs|cjs|json|env|sh|ya?ml|md)$/.test(e) || e === '.npmrc') out.push(p)
  }
  return out
}

if (!existsSync(APP)) {
  console.error(`check-npmrc-token: ${APP} not found`)
  process.exit(2)
}

const violations = []
for (const file of walk(APP)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const m = LITERAL_TOKEN.exec(line)
    if (m) violations.push({ file, line: i + 1, value: m[1] })
  })
}

if (violations.length > 0) {
  console.error('check-npmrc-token: FAIL — a literal registry auth token is committed (L15):')
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  _authToken=${v.value.slice(0, 8)}…`)
  }
  console.error('check-npmrc-token: the token must be read from an env var: _authToken=${NODE_AUTH_TOKEN}')
  process.exit(1)
}
console.log('check-npmrc-token: OK — no committed literal auth token; registry auth is env-only.')
