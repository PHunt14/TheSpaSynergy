import { test, expect } from '@playwright/test'

test.describe('Public pages smoke tests', () => {
  test('homepage loads with business name and CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Spa Synergy/i)
    await expect(page.locator('.nav-logo')).toBeVisible()
    await expect(page.locator('a[href="/booking"]').first()).toBeVisible()
  })

  test('booking page loads and shows practitioners', async ({ page }) => {
    await page.goto('/booking')
    await expect(page.locator('h1')).toContainText('Professionals')
  })

  test('providers page loads', async ({ page }) => {
    await page.goto('/providers')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('contact page loads', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('navbar contains expected links', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('a[href="/booking"]').first()).toBeVisible()
    await expect(page.locator('a[href="/providers"]').first()).toBeVisible()
    await expect(page.locator('a[href="/contact"]').first()).toBeVisible()
  })

  test('footer contains address and links', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('footer').locator('text=Cascade (Fort Ritchie), MD 21719')).toBeVisible()
    await expect(page.locator('footer a[href="/dashboard"]')).toBeVisible()
  })
})
