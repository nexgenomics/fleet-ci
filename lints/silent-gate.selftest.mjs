// silent-gate.selftest.mjs — silent-gate.mjs walked red and green on every run
// (item 1705). Each case is a throwaway app directory; the lint's exit status
// is the answer. Run from anywhere: node fabric-apps/lints/silent-gate.selftest.mjs
//
// Walked against two broken lints before delivery: one that never fails (the
// two opt-out-without-gate cases went red here), and one that reads comments
// (the comment cases went red).

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const LINT = join(dirname(fileURLToPath(import.meta.url)), 'silent-gate.mjs')

const cases = [
  ['the default: AuthProvider with no opt-out', 0, { 'src/main.tsx': '<AuthProvider>\n  <App />\n</AuthProvider>' }],
  ['opts out as a prop and mounts no gate', 1, { 'src/main.tsx': '<AuthProvider silentSignIn={false}>\n  <App />\n</AuthProvider>' }],
  [
    'opts out in an options object and mounts no gate',
    1,
    {
      'src/authOptions.ts': 'export const authOptions = { crossTabSignIn: true, silentSignIn: false } as const',
      'src/main.tsx': '<AuthProvider {...authOptions}><App /></AuthProvider>',
    },
  ],
  [
    'opts out and mounts its own gate in another file',
    0,
    {
      'src/main.tsx': '<AuthProvider silentSignIn={false}><App /></AuthProvider>',
      'src/app/Tier.tsx': 'return <SilentSignInGate loading={<Spinner />}><Outlet /></SilentSignInGate>',
    },
  ],
  [
    'an opt-out written only in a comment does not count',
    0,
    { 'src/main.tsx': '// we used to pass silentSignIn={false} here\n{/* silentSignIn: false */}\n<AuthProvider><App /></AuthProvider>' },
  ],
  [
    'a gate written only in a comment does not count',
    1,
    { 'src/main.tsx': '<AuthProvider silentSignIn={false}>\n  {/* <SilentSignInGate> goes here */}\n  <App />\n</AuthProvider>' },
  ],
  ['silentSignIn={true} is not an opt-out', 0, { 'src/main.tsx': '<AuthProvider silentSignIn={true}><App /></AuthProvider>' }],
  ['an empty src/ fails: nothing scanned', 1, { 'src/.keep': '' }],
  ['no src/ at all is a usage error', 2, {}],
]

let failed = 0
for (const [name, want, files] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'silent-gate-'))
  try {
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true })
      writeFileSync(join(dir, p), body)
    }
    const r = spawnSync(process.execPath, [LINT, dir], { encoding: 'utf8' })
    const ok = r.status === want
    if (!ok) failed++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: exit ${r.status}, want ${want}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
if (failed) {
  console.error(`silent-gate selftest: FAIL — ${failed} of ${cases.length} cases`)
  process.exit(1)
}
console.log(`silent-gate selftest: OK — ${cases.length} cases (4 red, 1 usage error, 4 green)`)
