/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/__tests__/**/*.test.mjs'],
  testPathIgnorePatterns: ['/node_modules/', '/services/'],
}

export default config
