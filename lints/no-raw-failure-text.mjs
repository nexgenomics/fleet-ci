// no-raw-failure-text.mjs — no customer-facing screen shows a code, an HTTP
// status or a server string (campaign-onboarding chunk 1). Every failure goes
// through @nexgenomics/core's toFailure and is shown with <FailureNote>: a
// sentence written in core, an action, and the request id. This lint is the
// backstop for that rule; the structural half is core's types (provider state
// carries `failure`, never `message`).
//
// It flags, in the app's own src/:
//   1. reading a server problem's `.detail`            (the server's own words)
//   2. reading an Error's `.message` (e / err / error …) (a library's words)
//   3. rendering any `.message` or `.statusText` in JSX  ({x.message})
//   4. rendering String(something) in JSX               ({String(e)})
//   5. putting a status into text                       (`… ${res.status}`, `${status}`)
//   6. putting a problem code into text                 (`(${code})`)
//
// What a line lint cannot see: a string held in state and rendered later
// ({err} where err was built from one of the above). That is why the
// structural half matters — core's provider states carry a Failure, not a
// string — and why the build line above is flagged where it is written.
//
// Line-based, like no-raw-gateway: comment lines and console.* lines are
// skipped. A line that genuinely needs one of these (a developer-only page, a
// log) carries `failure-text-ok: <reason>` in a comment on the same line; the
// reason is the review.
//
// Usage:  node no-raw-failure-text.mjs [app-dir]   (default: cwd)
//         node no-raw-failure-text.mjs --selftest  (proves each pattern can fail)
// Scans <app-dir>/src. Exit 1 on any violation; exit 2 on a usage/IO error.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

export const PATTERNS = [
  { name: 'server detail', re: /\.detail\b(?!\s*:)|\(\s*['"]detail['"]\s*\)|\[\s*['"]detail['"]\s*\]/ },
  { name: 'error message', re: /\b(?:e|err|error|ex|reason|cause|exc)\.message\b/ },
  { name: 'rendered message', re: /\{[^{}]*\.(?:message|statusText)\s*\}/ },
  { name: 'rendered String()', re: /\{\s*String\(\s*[\w.]+\s*\)\s*\}/ },
  {
    name: 'status in text',
    re: /\$\{\s*(?:\w+\.)?status(?:Code)?\s*\}|['"`]\s*\+\s*(?:res|resp|response)\.status\b|\.statusText\b/,
  },
  { name: 'code in text', re: /\$\{\s*(?:\w+\.)?code\s*\}/ },
]

const ESCAPE = /failure-text-ok:\s*\S/

/** The violations on one line of source, [] when clean. */
export function lineViolations(line) {
  const t = line.trim()
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return []
  if (/\bconsole\.\w+\(/.test(t)) return []
  if (ESCAPE.test(line)) return []
  return PATTERNS.filter((p) => p.re.test(line)).map((p) => p.name)
}

function selftest() {
  const red = [
    ['const d = (error as { detail?: string }).detail', 'server detail'],
    ['message: e instanceof Error ? e.message : String(e)', 'error message'],
    ['<p className="text-danger">{state.message}</p>', 'rendered message'],
    ['<span>{String(err)}</span>', 'rendered String()'],
    ['setError(`save failed (${res.status})`)', 'status in text'],
    ["setError('Resend failed (' + response.status + ')')", 'status in text'],
    ['let msg = detail ?? code ?? `Request failed with status ${status}`', 'status in text'],
    ["detail: str('detail') ?? str('message'),", 'server detail'],
    ['if (detail && code) msg = `${detail} (${code})`', 'code in text'],
    ['<p>{error.message}</p>', 'error message'],
  ]
  const green = [
    '<FailureNote failure={state.failure} onRetry={refresh} />',
    'const f = toFailure(error, response)',
    'detail?: string',
    '// the server detail is never shown',
    "console.error('load failed', err.message)",
    'if (response.status === 404) return null',
    '<p>{t.message}</p> // failure-text-ok: developer-only probe page',
  ]
  let bad = 0
  for (const [line, want] of red) {
    const got = lineViolations(line)
    if (!got.includes(want)) {
      console.error(`selftest: RED case not caught (${want}): ${line}`)
      bad++
    }
  }
  for (const line of green) {
    const got = lineViolations(line)
    if (got.length) {
      console.error(`selftest: GREEN case flagged (${got.join(', ')}): ${line}`)
      bad++
    }
  }
  if (bad) {
    console.error(`no-raw-failure-text: SELFTEST FAIL (${bad})`)
    process.exit(1)
  }
  console.log(`no-raw-failure-text: SELFTEST PASS (${red.length} red paths, ${green.length} green paths)`)
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

function main() {
  if (process.argv[2] === '--selftest') return selftest()
  const APP = resolve(process.argv[2] || '.')
  const SRC = join(APP, 'src')
  if (!existsSync(SRC)) {
    console.error(`no-raw-failure-text: ${SRC} not found`)
    process.exit(2)
  }
  const violations = []
  for (const file of walk(SRC)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const name of lineViolations(line)) {
          violations.push({ file, line: i + 1, name, text: line.trim().slice(0, 100) })
        }
      })
  }
  if (violations.length > 0) {
    console.error('no-raw-failure-text: FAIL — a screen could show a code, a status or a server string:')
    for (const v of violations) console.error(`  ${v.file}:${v.line}  [${v.name}]  ${v.text}`)
    console.error('no-raw-failure-text: turn the failure into a sentence with toFailure() and show it with <FailureNote>')
    console.error('no-raw-failure-text: (@nexgenomics/core/lib, @nexgenomics/core/ui). A developer-only line may carry')
    console.error('no-raw-failure-text: `// failure-text-ok: <reason>`.')
    process.exit(1)
  }
  console.log('no-raw-failure-text: OK — failures reach people only as sentences.')
}

main()
