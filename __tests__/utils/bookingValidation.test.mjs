/**
 * Unit tests for Booking Validation Utilities
 *
 * Validates the validateTimeFrame, sanitizeTextInput, and validateExtras functions
 * against acceptance criteria from Requirements 5.1, 5.2, 5.3, 5.6.
 */

import { validateTimeFrame, sanitizeTextInput, validateExtras } from '../../app/utils/bookingValidation.js'

describe('Booking Validation Utilities', () => {
  describe('validateTimeFrame', () => {
    test('accepts "morning" as valid', () => {
      const result = validateTimeFrame('morning')
      expect(result).toEqual({ valid: true, error: null })
    })

    test('accepts "afternoon" as valid', () => {
      const result = validateTimeFrame('afternoon')
      expect(result).toEqual({ valid: true, error: null })
    })

    test('accepts "evening" as valid', () => {
      const result = validateTimeFrame('evening')
      expect(result).toEqual({ valid: true, error: null })
    })

    test('rejects uppercase "Morning" (case-sensitive)', () => {
      const result = validateTimeFrame('Morning')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('morning, afternoon, evening')
    })

    test('rejects "AFTERNOON" (case-sensitive)', () => {
      const result = validateTimeFrame('AFTERNOON')
      expect(result.valid).toBe(false)
    })

    test('rejects invalid values like "night"', () => {
      const result = validateTimeFrame('night')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid timeFrame')
    })

    test('rejects empty string', () => {
      const result = validateTimeFrame('')
      expect(result.valid).toBe(false)
    })

    test('rejects null', () => {
      const result = validateTimeFrame(null)
      expect(result.valid).toBe(false)
    })

    test('rejects undefined', () => {
      const result = validateTimeFrame(undefined)
      expect(result.valid).toBe(false)
    })
  })

  describe('sanitizeTextInput', () => {
    test('returns plain text unchanged', () => {
      const result = sanitizeTextInput('Hello world')
      expect(result).toBe('Hello world')
    })

    test('strips HTML tags', () => {
      const result = sanitizeTextInput('<b>bold</b> text')
      expect(result).toBe('bold text')
    })

    test('removes script tags and their content', () => {
      const result = sanitizeTextInput('before<script>alert("xss")</script>after')
      expect(result).toBe('beforeafter')
    })

    test('removes multi-line script tags', () => {
      const result = sanitizeTextInput('hello<script>\nvar x = 1;\n</script>world')
      expect(result).toBe('helloworld')
    })

    test('enforces default max length of 500', () => {
      const longText = 'a'.repeat(600)
      const result = sanitizeTextInput(longText)
      expect(result.length).toBe(500)
    })

    test('enforces custom max length', () => {
      const text = 'a'.repeat(100)
      const result = sanitizeTextInput(text, 50)
      expect(result.length).toBe(50)
    })

    test('returns empty string for null input', () => {
      const result = sanitizeTextInput(null)
      expect(result).toBe('')
    })

    test('returns empty string for undefined input', () => {
      const result = sanitizeTextInput(undefined)
      expect(result).toBe('')
    })

    test('returns empty string when input is only HTML tags', () => {
      const result = sanitizeTextInput('<div><span></span></div>')
      expect(result).toBe('')
    })

    test('trims whitespace', () => {
      const result = sanitizeTextInput('  hello  ')
      expect(result).toBe('hello')
    })

    test('handles nested HTML tags', () => {
      const result = sanitizeTextInput('<div><p>text</p></div>')
      expect(result).toBe('text')
    })
  })

  describe('validateExtras', () => {
    const catalog = [
      { extraId: 'e1', name: 'Charcuterie', isActive: true, assignedBundleIds: ['b1', 'b2'] },
      { extraId: 'e2', name: 'Fruit Tray', isActive: true, assignedBundleIds: ['b1'] },
      { extraId: 'e3', name: 'Drinks', isActive: false, assignedBundleIds: ['b1'] },
      { extraId: 'e4', name: 'Candles', isActive: true, assignedBundleIds: ['b2'] },
    ]

    test('accepts valid extras assigned to the bundle', () => {
      const result = validateExtras(['e1', 'e2'], 'b1', catalog)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
      expect(result.validExtras).toHaveLength(2)
    })

    test('rejects extra not found in catalog', () => {
      const result = validateExtras(['e999'], 'b1', catalog)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Extra not found: e999')
    })

    test('rejects inactive extra', () => {
      const result = validateExtras(['e3'], 'b1', catalog)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Extra is not active: e3')
    })

    test('rejects extra not assigned to the booking bundle', () => {
      const result = validateExtras(['e4'], 'b1', catalog)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Extra e4 is not available for this bundle')
    })

    test('rejects when more than 20 extras provided', () => {
      const ids = Array.from({ length: 21 }, (_, i) => `e${i}`)
      const result = validateExtras(ids, 'b1', catalog)
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('Maximum 20 extras')
    })

    test('accepts exactly 20 extras when all valid', () => {
      const largeCatalog = Array.from({ length: 20 }, (_, i) => ({
        extraId: `e${i}`,
        name: `Extra ${i}`,
        isActive: true,
        assignedBundleIds: ['b1'],
      }))
      const ids = largeCatalog.map(e => e.extraId)
      const result = validateExtras(ids, 'b1', largeCatalog)
      expect(result.valid).toBe(true)
      expect(result.validExtras).toHaveLength(20)
    })

    test('accepts empty array', () => {
      const result = validateExtras([], 'b1', catalog)
      expect(result.valid).toBe(true)
      expect(result.validExtras).toEqual([])
    })

    test('accepts null extraIds gracefully', () => {
      const result = validateExtras(null, 'b1', catalog)
      expect(result.valid).toBe(true)
      expect(result.validExtras).toEqual([])
    })

    test('collects multiple errors for multiple invalid extras', () => {
      const result = validateExtras(['e999', 'e3', 'e4'], 'b1', catalog)
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(3)
    })

    test('returns valid extras even when some are invalid', () => {
      const result = validateExtras(['e1', 'e999'], 'b1', catalog)
      expect(result.valid).toBe(false)
      expect(result.validExtras).toHaveLength(1)
      expect(result.validExtras[0].extraId).toBe('e1')
    })
  })
})
