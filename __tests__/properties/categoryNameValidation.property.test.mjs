/**
 * Property-Based Tests for Category Name Validation
 *
 * Uses fast-check to validate correctness properties for category name
 * validation logic (length, trimming, and case-insensitive duplicate detection).
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 3: Category name validation
 *
 * **Validates: Requirements 2.3, 2.4**
 */

import fc from 'fast-check'
import { validateCategoryName } from '../../app/utils/categoryValidator.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a category name with trimmed length between 2 and 50 characters.
 */
function arbValidLengthName() {
  return fc.integer({ min: 2, max: 50 }).chain((len) =>
    fc.string({ minLength: len, maxLength: len }).filter((s) => {
      const trimmed = s.trim()
      return trimmed.length >= 2 && trimmed.length <= 50
    })
  )
}

/**
 * Generates a non-whitespace string with trimmed length between 2 and 50.
 * Uses alphanumeric and common characters to avoid filter rejections.
 */
function arbValidName() {
  return fc.stringOf(
    fc.oneof(
      fc.integer({ min: 0x21, max: 0x7e }).map((n) => String.fromCharCode(n)),
      fc.constantFrom('a', 'b', 'c', 'A', 'B', 'C', '1', '2', '3', '-', '_', ' ')
    ),
    { minLength: 2, maxLength: 50 }
  ).filter((s) => {
    const len = s.trim().length
    return len >= 2 && len <= 50
  })
}

/**
 * Generates a name whose trimmed length is < 2 (too short).
 */
function arbTooShortName() {
  return fc.oneof(
    fc.constant(''),
    fc.constant(' '),
    fc.constant('  '),
    fc.constant('\t'),
    fc.constant('\n'),
    fc.constant('a'),
    fc.constant(' a '),
    fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 10 }),
    fc.char16bits().filter((c) => c.trim().length <= 1).map((c) => c)
  ).filter((s) => s.trim().length < 2)
}

/**
 * Generates a name whose trimmed length is > 50 (too long).
 */
function arbTooLongName() {
  return fc.stringOf(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
    { minLength: 51, maxLength: 80 }
  )
}

/**
 * Generates a list of existing category names (unique, non-empty strings).
 */
function arbExistingCategories() {
  return fc.array(
    fc.stringOf(
      fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'),
      { minLength: 2, maxLength: 30 }
    ),
    { minLength: 0, maxLength: 10 }
  )
}

/**
 * Generates leading/trailing whitespace to wrap around a name.
 */
function arbWhitespace() {
  return fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 1, maxLength: 5 })
}

// ── Property 3: Category Name Validation ──────────────────────

describe('Feature: unified-business-model, Property 3: Category name validation', () => {
  test('valid names accepted: trimmed length 2-50, no case-insensitive duplicate → valid', () => {
    fc.assert(
      fc.property(
        arbValidName(),
        arbExistingCategories(),
        (name, existing) => {
          const trimmed = name.trim()
          // Ensure name doesn't duplicate any existing (case-insensitive)
          const hasDuplicate = existing.some(
            (e) => e.toLowerCase() === trimmed.toLowerCase()
          )
          if (hasDuplicate) return true // skip this case, tested separately

          const result = validateCategoryName(name, existing)
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('too short names rejected: trimmed length < 2 → invalid', () => {
    fc.assert(
      fc.property(
        arbTooShortName(),
        arbExistingCategories(),
        (name, existing) => {
          const result = validateCategoryName(name, existing)
          return result.valid === false && result.error !== undefined
        }
      ),
      { numRuns: 100 }
    )
  })

  test('too long names rejected: trimmed length > 50 → invalid', () => {
    fc.assert(
      fc.property(
        arbTooLongName(),
        arbExistingCategories(),
        (name, existing) => {
          const result = validateCategoryName(name, existing)
          return result.valid === false && result.error !== undefined
        }
      ),
      { numRuns: 100 }
    )
  })

  test('duplicates rejected: name case-insensitively matches existing → invalid', () => {
    fc.assert(
      fc.property(
        arbValidName(),
        arbExistingCategories(),
        fc.constantFrom('lower', 'upper', 'mixed'),
        (name, baseExisting, caseVariant) => {
          const trimmed = name.trim()
          // Create a case variant of the name to insert into existing list
          let duplicate
          if (caseVariant === 'lower') duplicate = trimmed.toLowerCase()
          else if (caseVariant === 'upper') duplicate = trimmed.toUpperCase()
          else duplicate = trimmed.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join('')

          const existing = [...baseExisting, duplicate]
          const result = validateCategoryName(name, existing)
          return result.valid === false && result.error !== undefined
        }
      ),
      { numRuns: 100 }
    )
  })

  test('trimming: whitespace around name does not affect outcome', () => {
    fc.assert(
      fc.property(
        arbValidName(),
        arbExistingCategories(),
        arbWhitespace(),
        arbWhitespace(),
        (name, existing, leadingWs, trailingWs) => {
          const paddedName = leadingWs + name + trailingWs
          const resultPadded = validateCategoryName(paddedName, existing)
          const resultDirect = validateCategoryName(name, existing)
          // Both should produce the same validity
          return resultPadded.valid === resultDirect.valid
        }
      ),
      { numRuns: 100 }
    )
  })
})
