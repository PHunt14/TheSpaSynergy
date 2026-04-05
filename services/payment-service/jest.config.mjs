/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/__tests__/**/*.test.mjs'],
  collectCoverageFrom: [
    'src/**/*.js',
  ],
}

export default config
