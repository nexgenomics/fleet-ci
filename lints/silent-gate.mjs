// silent-gate.mjs — an app keeps its session across a reload (item 1705).
//
// Since @nexgenomics/core 4.22.0, AuthProvider holds the app behind
// SilentSignInGate by default: after a reload the gate asks the identity
// provider once, in a hidden frame, and a live session comes back with no
// sign-in card. An app with public pages that must paint before any sign-in
// attempt may opt out — `silentSignIn={false}` — and must then mount
// SilentSignInGate itself around its signed-in part, as Mind of God does. An app
// that opts out and mounts none shows the sign-in card on every reload, while
// pressing Sign in returns at once: what Syntin Compliance did (goal 1679),
// because nothing failed — the app "worked".
//
// So: when any file under src/ opts out, some file under src/ must render
// <SilentSignInGate>. Comments are ignored on both sides, so a note about the
// prop neither trips nor satisfies this.
//
// Usage:  node silent-gate.mjs [app-dir]   (default: cwd)
// Scans <app-dir>/src. Exit 1 on a violation, and on scanning no files (a lint
// that matches nothing is not a passing lint); exit 2 on a usage/IO error.
// Its own red cases: silent-gate.selftest.mjs.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const APP = resolve(process.argv[2] || '.')
const SRC = join(APP, 'src')
if (!existsSync(SRC)) {
  console.error(`silent-gate: ${SRC} not found`)
  process.exit(2)
}

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(e)) out.push(p)
  }
  return out
}

// Block comments (including JSX's {/* … */}) and whole-line // comments. A //
// after code is left alone: it is rarely a comment about this prop, and cutting
// at it would cut every https:// in the file.
const uncomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PROVIDER_RE = /<AuthProvider\b/
// The opt-out, as a JSX prop or as a property of an options object spread into
// the provider (`silentSignIn: false`).
const OPT_OUT_RE = /\bsilentSignIn\s*(?:=\s*\{\s*false\s*\}|:\s*false\b)/
const GATE_RE = /<SilentSignInGate\b/

const files = walk(SRC)
if (files.length === 0) {
  console.error(`silent-gate: FAIL — scanned 0 files under ${SRC}; a lint that matches nothing is not a passing lint`)
  process.exit(1)
}

const providers = []
const optOuts = []
const gates = []
for (const f of files) {
  const src = uncomment(readFileSync(f, 'utf8'))
  const rel = relative(APP, f)
  if (PROVIDER_RE.test(src)) providers.push(rel)
  if (OPT_OUT_RE.test(src)) optOuts.push(rel)
  if (GATE_RE.test(src)) gates.push(rel)
}

if (optOuts.length > 0 && gates.length === 0) {
  console.error(`silent-gate: FAIL — ${optOuts.join(', ')} opt${optOuts.length === 1 ? 's' : ''} out of AuthProvider's silent sign-in (silentSignIn false) and no file under src/ mounts <SilentSignInGate>.`)
  console.error('  Every reload would show the sign-in card. Mount SilentSignInGate around the signed-in part, or drop the opt-out.')
  process.exit(1)
}

if (providers.length === 0) {
  console.log(`silent-gate: OK — no <AuthProvider> under src/ (${files.length} files): nothing signs in, nothing to gate`)
} else if (optOuts.length === 0) {
  console.log(`silent-gate: OK — AuthProvider's own silent gate (${providers.join(', ')}); ${files.length} files scanned`)
} else {
  console.log(`silent-gate: OK — opts out (${optOuts.join(', ')}) and mounts its own gate (${gates.join(', ')}); ${files.length} files scanned`)
}
