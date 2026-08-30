/**
 * Guard test: the Amplify backend is compiled with `moduleResolution: NodeNext`
 * (see amplify/tsconfig.json). Under NodeNext, relative imports in ESM MUST
 * carry an explicit file extension (e.g. './types.js'), otherwise
 * `ampx pipeline-deploy` fails with TS2835 during deploy.
 *
 * The root tsconfig uses `moduleResolution: bundler`, which does NOT enforce
 * this — so the regular typecheck and app tests will happily pass while a
 * deploy breaks. This test statically walks the backend's module graph
 * (the Lambda handlers plus everything they import from lib/) and asserts
 * every relative import/export specifier has an explicit extension.
 *
 * If this fails, add the missing `.js` extension to the reported import.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

// Entry points that are bundled into Lambda functions and thus compiled
// under amplify/tsconfig.json's NodeNext resolution.
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

function hasExplicitExtension(spec) {
  // Accept known source/asset extensions. NodeNext requires the emitted
  // extension (.js/.mjs/.cjs) or .json for JSON modules.
  return /\.(js|mjs|cjs|json|jsx)$/.test(spec)
}

/**
 * Resolve a relative specifier (which points at the emitted .js) back to the
 * source .ts/.js file on disk so we can continue walking the graph.
 */
function resolveSourceFile(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec)
  const candidates = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base.replace(/\.mjs$/, '.mts'),
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.js'),
  ]
  return candidates.find((c) => existsSync(c)) || null
}

/**
 * Walk the module graph from the entry points, collecting every violation
 * (relative import without an explicit extension) along the way.
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

      if (!hasExplicitExtension(spec)) {
        violations.push({ file: relative(repoRoot, file), spec })
        continue
      }

      // Follow the import to keep walking the graph.
      const next = resolveSourceFile(file, spec)
      if (next) queue.push(next)
    }
  }

  return { violations, visitedCount: visited.size }
}

describe('Amplify backend NodeNext import extensions', () => {
  const { violations, visitedCount } = collectViolations()

  test('the backend module graph was actually traversed', () => {
    // Sanity check: if this is 0, the entry points or resolution broke and the
    // test would pass vacuously.
    expect(visitedCount).toBeGreaterThan(1)
  })

  test('every relative import in the backend graph has an explicit extension', () => {
    const message =
      violations.length === 0
        ? ''
        : 'Relative imports missing an explicit extension (required by NodeNext, breaks ampx deploy):\n' +
          violations.map((v) => `  ${v.file}: '${v.spec}' (did you mean '${v.spec}.js'?)`).join('\n')

    expect(message).toBe('')
  })
})
