/**
 * Property-Based Tests for Text Input Sanitization
 *
 * Uses fast-check to validate that the sanitizeTextInput function strips
 * all HTML tags and script content, and enforces a maximum output length.
 *
 * Feature: booking-enhancements, Property 11: Text input sanitization
 *
 * **Validates: Requirements 5.6**
 */

import fc from 'fast-check'
import { sanitizeTextInput } from '../../app/utils/bookingValidation.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates arbitrary plain text strings (customer notes without HTML).
 */
function arbPlainText() {
  return fc.string({ minLength: 0, maxLength: 600 })
}

/**
 * Generates strings containing HTML script tags with various content.
 */
function arbScriptInjection() {
  return fc.tuple(fc.string(), fc.string(), fc.string()).map(
    ([before, scriptBody, after]) =>
      `${before}<script>${scriptBody}</script>${after}`
  )
}

/**
 * Generates strings with various HTML tags embedded.
 */
function arbHtmlTags() {
  const tagNames = fc.oneof(
    fc.constant('div'),
    fc.constant('span'),
    fc.constant('p'),
    fc.constant('a'),
    fc.constant('img'),
    fc.constant('b'),
    fc.constant('i'),
    fc.constant('strong'),
    fc.constant('em'),
    fc.constant('h1'),
    fc.constant('br'),
    fc.constant('table'),
    fc.constant('iframe')
  )

  return fc.tuple(fc.string(), tagNames, fc.string(), fc.string()).map(
    ([before, tag, content, after]) =>
      `${before}<${tag}>${content}</${tag}>${after}`
  )
}

/**
 * Generates strings with script tags using various casing and attributes.
 */
function arbScriptVariants() {
  return fc.oneof(
    fc.string().map((s) => `<script>${s}</script>`),
    fc.string().map((s) => `<SCRIPT>${s}</SCRIPT>`),
    fc.string().map((s) => `<Script type="text/javascript">${s}</Script>`),
    fc.string().map((s) => `<script src="evil.js">${s}</script>`),
    fc.tuple(fc.string(), fc.string()).map(
      ([before, after]) => `${before}<script>alert('xss')</script>${after}`
    )
  )
}

/**
 * Generates strings that mix HTML tags, script tags, and plain text.
 */
function arbMixedContent() {
  return fc.tuple(
    fc.string(),
    fc.oneof(
      fc.constant('<b>bold</b>'),
      fc.constant('<script>alert(1)</script>'),
      fc.constant('<div class="x">content</div>'),
      fc.constant('<img src="x" onerror="alert(1)">'),
      fc.constant('<a href="javascript:void(0)">link</a>')
    ),
    fc.string()
  ).map(([before, html, after]) => `${before}${html}${after}`)
}

// ── Helpers ───────────────────────────────────────────────────

const HTML_TAG_PATTERN = /<[^>]*>/
const SCRIPT_OPEN_PATTERN = /<script/i
const SCRIPT_CLOSE_PATTERN = /<\/script>/i

// ── Property 11: Text input sanitization ──────────────────────

describe('Feature: booking-enhancements, Property 11: Text input sanitization', () => {
  test('sanitized output never contains HTML tag patterns', () => {
    fc.assert(
      fc.property(
        arbHtmlTags(),
        (input) => {
          const result = sanitizeTextInput(input)
          return !HTML_TAG_PATTERN.test(result)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('sanitized output never contains <script or </script> patterns', () => {
    fc.assert(
      fc.property(
        arbScriptVariants(),
        (input) => {
          const result = sanitizeTextInput(input)
          return (
            !SCRIPT_OPEN_PATTERN.test(result) &&
            !SCRIPT_CLOSE_PATTERN.test(result)
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('output length is at most 500 characters (default max length)', () => {
    fc.assert(
      fc.property(
        arbPlainText(),
        (input) => {
          const result = sanitizeTextInput(input)
          return result.length <= 500
        }
      ),
      { numRuns: 100 }
    )
  })

  test('for any input with mixed HTML and text, output contains no HTML tags', () => {
    fc.assert(
      fc.property(
        arbMixedContent(),
        (input) => {
          const result = sanitizeTextInput(input)
          return (
            !HTML_TAG_PATTERN.test(result) &&
            !SCRIPT_OPEN_PATTERN.test(result) &&
            !SCRIPT_CLOSE_PATTERN.test(result)
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('script tag content is fully removed from output', () => {
    fc.assert(
      fc.property(
        arbScriptInjection(),
        (input) => {
          const result = sanitizeTextInput(input)
          return (
            !SCRIPT_OPEN_PATTERN.test(result) &&
            !SCRIPT_CLOSE_PATTERN.test(result) &&
            !HTML_TAG_PATTERN.test(result)
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('output length respects custom maxLength parameter', () => {
    fc.assert(
      fc.property(
        fc.tuple(arbPlainText(), fc.integer({ min: 1, max: 1000 })),
        ([input, maxLength]) => {
          const result = sanitizeTextInput(input, maxLength)
          return result.length <= maxLength
        }
      ),
      { numRuns: 100 }
    )
  })

  test('null and undefined inputs return empty string', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.constant(undefined)),
        (input) => {
          const result = sanitizeTextInput(input)
          return result === ''
        }
      ),
      { numRuns: 100 }
    )
  })
})
