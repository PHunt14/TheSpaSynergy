/**
 * Category Validator
 *
 * Validates service category names for uniqueness and format.
 * Used when staff members add new categories to the predefined list.
 */

export interface CategoryValidationResult {
  valid: boolean;
  error?: string;
}

const MIN_LENGTH = 2;
const MAX_LENGTH = 50;

/**
 * Validates a category name against format and uniqueness rules.
 *
 * Rules:
 * - Trims whitespace before validation
 * - Name length must be between 2 and 50 characters (inclusive, after trimming)
 * - Name must not duplicate an existing category (case-insensitive comparison)
 *
 * @param name - The candidate category name
 * @param existingCategories - List of existing category names to check for duplicates
 * @returns Validation result with `valid` flag and optional `error` message
 */
export function validateCategoryName(
  name: string,
  existingCategories: string[]
): CategoryValidationResult {
  const trimmed = name.trim();

  if (trimmed.length < MIN_LENGTH) {
    return {
      valid: false,
      error: `Category name must be at least ${MIN_LENGTH} characters`,
    };
  }

  if (trimmed.length > MAX_LENGTH) {
    return {
      valid: false,
      error: `Category name must be at most ${MAX_LENGTH} characters`,
    };
  }

  const isDuplicate = existingCategories.some(
    (existing) => existing.toLowerCase() === trimmed.toLowerCase()
  );

  if (isDuplicate) {
    return {
      valid: false,
      error: `Category name is already in use`,
    };
  }

  return { valid: true };
}
