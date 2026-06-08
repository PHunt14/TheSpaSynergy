/**
 * Unit Tests for Category Validator
 *
 * Tests the validateCategoryName function for format and uniqueness rules.
 */

import { describe, test, expect } from '@jest/globals'
import { validateCategoryName } from '../../app/utils/categoryValidator.ts'

describe('validateCategoryName', () => {
  const existingCategories = ['Hair', 'Skin', 'Massage', 'Nails']

  describe('valid names', () => {
    test('accepts a name within length bounds', () => {
      const result = validateCategoryName('Waxing', existingCategories)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    test('accepts a name at minimum length (2 chars)', () => {
      const result = validateCategoryName('AB', existingCategories)
      expect(result.valid).toBe(true)
    })

    test('accepts a name at maximum length (50 chars)', () => {
      const name = 'A'.repeat(50)
      const result = validateCategoryName(name, existingCategories)
      expect(result.valid).toBe(true)
    })

    test('trims whitespace before validation', () => {
      const result = validateCategoryName('  Waxing  ', existingCategories)
      expect(result.valid).toBe(true)
    })

    test('accepts name when existing list is empty', () => {
      const result = validateCategoryName('Hair', [])
      expect(result.valid).toBe(true)
    })
  })

  describe('too short', () => {
    test('rejects empty string', () => {
      const result = validateCategoryName('', existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('at least 2')
    })

    test('rejects single character', () => {
      const result = validateCategoryName('A', existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('at least 2')
    })

    test('rejects whitespace-only that trims to below minimum', () => {
      const result = validateCategoryName('   ', existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('at least 2')
    })

    test('rejects single char padded with whitespace', () => {
      const result = validateCategoryName('  A  ', existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('at least 2')
    })
  })

  describe('too long', () => {
    test('rejects name over 50 characters', () => {
      const name = 'A'.repeat(51)
      const result = validateCategoryName(name, existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('at most 50')
    })
  })

  describe('duplicate check (case-insensitive)', () => {
    test('rejects exact duplicate', () => {
      const result = validateCategoryName('Hair', existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('already in use')
    })

    test('rejects case-insensitive duplicate (lowercase input)', () => {
      const result = validateCategoryName('hair', existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('already in use')
    })

    test('rejects case-insensitive duplicate (uppercase input)', () => {
      const result = validateCategoryName('MASSAGE', existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('already in use')
    })

    test('rejects case-insensitive duplicate with mixed case', () => {
      const result = validateCategoryName('sKiN', existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('already in use')
    })

    test('rejects duplicate after trimming whitespace', () => {
      const result = validateCategoryName('  Hair  ', existingCategories)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('already in use')
    })
  })
})
