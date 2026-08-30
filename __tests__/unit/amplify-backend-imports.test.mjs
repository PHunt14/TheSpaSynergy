/**
 * Guard test: keep the Amplify backend module graph free of `.js` extensions
 * on relative imports that point at TypeScript source files.
 *
 * History / why this matters:
 * - `amplify/tsconfig.json` uses `moduleResolution: Bundler` (the Lambda
 *   functions are bundled by esbuild, which resolves extensionless TS imports).
 * - The Next.js app (Turbopack, `moduleResolution: bundler`) shares several of
 *   these files (e.g. lib/logger/*). Turbopack does NOT rewrite `./constants.js`
 *   to `constants.ts`, so a `.js` extension on a relative import that actually
 *   points at a `.ts` file breaks the app build (this happened once and took
 *   down the homepage).
 * - Therefore the correct, portable convention for shared TS is EXTENSIONLESS
 *   relative imports. This test enforces that across the backend graph so a
 *   well-meaning "add .js for NodeNext" change can't silently break the app.
 *
 * Note: importing a real `.js`/`.json` file by its actual extension is fine —
 * we only flag a `.js` (or `.ts`) extension whose target on disk is a `.ts`
 * source file.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

// Entry points that are bundled into Lambda functions / evaluated by the
// Amplify backend, plus everything they transitively import from lib/.
const ENTRY_POINTS = [
  'amplify/functions/send-sms/handler.ts',
  'amplify/functions/send-email/handler.ts',
  'amplify/backend.ts',
]

// Matches the specifier in `import ... from '<spec>'`, `export ... from '<spec>'`,
// and bare `import '<spec>'`. Captures the specifier string.
const SPECIFIER_RE = /(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g

function extractSpecifiers(source) {
  const specs = []
  let m
  while ((m = SPECIFIER_RE.exec(source)) !== null) {
    specs.push(m[1] || m[2])
  }
  return specs
}

function isRelative(spec) {
  return spec.startsWith('./') || spec.startsWith('../')
}

/** Strip any of the recognized extensions from a specifier. */
function stripExtension(spec) {
  return spec.replace(/\.(js|mjs|cjs|jsx|ts|tsx)$/, '')
}

/**
 * Resolve a relative specifier to the source file on disk (trying the common
 * TS/JS candidates), regardless of whether the specifier carried an extension.
 * Returns { path, isTs } or null.
 */
function resolveSourceFile(fromFile, spec) {
  const base = resolve(dirname(fromFile), stripExtension(spec))
  const candidates = [
    { path: `${base}.ts`, isTs: true },
    { path: `${base}.tsx`, isTs: true },
    { path: `${base}.mts`, isTs: true },
    { path: `${base}.js`, isTs: false },
    { path: `${base}.mjs`, isTs: false },
    { path: `${base}.json`, isTs: false },
    { path: resolve(base, 'index.ts'), isTs: true },
    { path: resolve(base, 'index.js'), isTs: false },
  ]
  return candidates.find((c) => existsSync(c.path)) || null
}

/**
 * A specifier is a violation when it carries an explicit extension AND that
 * extension's target on disk is a TypeScript source file. Extensionless
 * imports are the desired convention; importing a real .js/.json is fine.
 */
function hasBadExtension(spec, resolved) {
  const carriesExtension = /\.(js|mjs|cjs|jsx|ts|tsx)$/.test(spec)
  return carriesExtension && resolved?.isTs === true
}

/**
 * Walk the module graph from the entry points, collecting every violation.
 */
function collectViolations() {
  const violations = []
  const visited = new Set()
  const queue = ENTRY_POINTS.map((p) => resolve(repoRoot, p))

  while (queue.length > 0) {
    const file = queue.shift()
    if (!file || visited.has(file)) continue
    visited.add(file)

    if (!existsSync(file)) continue
    const source = readFileSync(file, 'utf8')
    const specs = extractSpecifiers(source)

    for (const spec of specs) {
      if (!isRelative(spec)) continue

      const resolved = resolveSourceFile(file, spec)

      if (hasBadExtension(spec, resolved)) {
        violations.push({ file: relative(repoRoot, file), spec })
      }

      // Follow the import to keep walking the graph.
      if (resolved) queue.push(resolved.path)
    }
  }

  return { violations, visitedCount: visited.size }
}

describe('Amplify backend import extensions (Bundler resolution)', () => {
  const { violations, visitedCount } = collectViolations()

  test('the backend module graph was actually traversed', () => {
    // Sanity check: if this is <= 1, the entry points or resolution broke and
    // the test would pass vacuously.
    expect(visitedCount).toBeGreaterThan(1)
  })

  test('no relative import in the backend graph uses a .js/.ts extension for a TS source file', () => {
    const message =
      violations.length === 0
        ? ''
        : 'Relative imports must be EXTENSIONLESS (they point at .ts sources; a ' +
          '.js extension breaks the Next.js/Turbopack build that shares these files):\n' +
          violations.map((v) => `  ${v.file}: '${v.spec}' (use '${stripExtension(v.spec)}')`).join('\n')

    expect(message).toBe('')
  })
})
