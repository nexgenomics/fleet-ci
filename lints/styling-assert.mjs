// styling-assert.mjs — per-app post-build check (D-caf-2 styling assertion).
// Asserts that @nexgenomics/core's utility classes reached the app's BUILT CSS.
// With @tailwindcss/vite, Tailwind scans the app's module graph but NOT
// node_modules — so without the `@source '../node_modules/@nexgenomics/core/src'`
// line, NONE of core's classes are generated and the app builds GREEN but
// renders UNSTYLED (the fabric-web-split regression). This catches that per app,
// from the app's own dist, with no need to pack core.
//
// The asserted classes exist in core/src components (animate-spin/rounded-md in
// Button/Spinner; z-30/inset-0 in Sheet). Because @source makes Tailwind scan
// ALL of core/src — not just what the app imports — their presence proves the
// @source line exposes core's full surface, independent of the app's own imports.
//
// Usage:  node styling-assert.mjs [app-dir]   (default: cwd) — run AFTER build.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const APP = resolve(process.argv[2] || '.')
const REQUIRE_CLASSES = ['animate-spin', 'rounded-md', 'z-30', 'inset-0']

const assetsDir = join(APP, 'dist', 'assets')
if (!existsSync(assetsDir)) {
  console.error(`styling-assert: ${assetsDir} not found — run \`npm run build\` first`)
  process.exit(2)
}
const cssFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.css'))
if (cssFiles.length === 0) {
  console.error('styling-assert: no CSS emitted in dist/assets')
  process.exit(1)
}
const builtCss = cssFiles.map((f) => readFileSync(join(assetsDir, f), 'utf8')).join('\n')
const missing = REQUIRE_CLASSES.filter((c) => !builtCss.includes(`.${c}`))
if (missing.length > 0) {
  console.error(
    `styling-assert: FAIL — built CSS is missing core classes [${missing.join(', ')}]. ` +
      'The app built but core is UNSTYLED — check the @source line into node_modules/@nexgenomics/core/src.',
  )
  process.exit(1)
}
console.log(`styling-assert: OK — core classes present in built CSS: ${REQUIRE_CLASSES.join(', ')}`)
