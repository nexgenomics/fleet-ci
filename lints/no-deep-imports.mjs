// no-deep-imports.mjs — enforce L13: an app may import ONLY @nexgenomics/core's
// declared `exports` subpaths, never its internal file layout
// (@nexgenomics/core/src/...). Deep-importing couples an app to core's source
// structure and breaks the source->compiled (L12) migration door; the declared
// exports are the contract D-ccp-3 versions.
//
// The allowlist is READ FROM THE INSTALLED core's package.json `exports` — not
// hardcoded — so it tracks core's evolution automatically. (core-pin.mjs is the
// companion guard that the installed core is the real pinned package, not a
// forked one with a widened exports map.)
//
// Usage:  node no-deep-imports.mjs [app-dir]   (default: cwd)
// Scans <app-dir>/src for import/export-from specifiers. Exit 1 on any violation.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const APP = resolve(process.argv[2] || '.')
const SCOPE = '@nexgenomics/core'

const corePkgPath = join(APP, 'node_modules', SCOPE, 'package.json')
if (!existsSync(corePkgPath)) {
  console.error(`no-deep-imports: ${SCOPE} is not installed under ${APP}/node_modules — run \`npm install\` first`)
  process.exit(2)
}
const exportsMap = JSON.parse(readFileSync(corePkgPath, 'utf8')).exports || {}
// Build the allowed specifier set from the exports keys: '.' -> bare specifier,
// './ui' -> '@nexgenomics/core/ui', etc.
const allowed = new Set(
  Object.keys(exportsMap).map((k) => (k === '.' ? SCOPE : `${SCOPE}/${k.replace(/^\.\//, '')}`)),
)

const SRC = join(APP, 'src')
if (!existsSync(SRC)) {
  console.error(`no-deep-imports: ${SRC} not found`)
  process.exit(2)
}

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx|js|jsx|mts|cts)$/.test(e)) out.push(p)
  }
  return out
}

// import ... from 'X' | export ... from 'X' | import('X') | require('X')
const SPEC_RE = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g

const violations = []
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    let m
    SPEC_RE.lastIndex = 0
    while ((m = SPEC_RE.exec(line)) !== null) {
      const spec = m[1]
      if (spec !== SCOPE && !spec.startsWith(`${SCOPE}/`)) continue // not a core import
      if (!allowed.has(spec)) {
        violations.push({ file, line: i + 1, spec })
      }
    }
  })
}

if (violations.length > 0) {
  console.error('no-deep-imports: FAIL — imports outside core\'s declared exports (L13):')
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.spec}`)
  }
  console.error(`no-deep-imports: allowed subpaths: ${[...allowed].sort().join(', ')}`)
  process.exit(1)
}
console.log(`no-deep-imports: OK — all ${SCOPE} imports use declared exports (${[...allowed].sort().join(', ')})`)
