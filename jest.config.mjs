/** @type {import('jest').Config} */
const config = {
  projects: [
    // Unit + API integration tests (Node environment)
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform: {},
      testMatch: ['**/__tests__/**/*.test.mjs'],
      testPathIgnorePatterns: ['/node_modules/', '/services/'],
    },
    // React component tests (jsdom environment)
    {
      displayName: 'components',
      testEnvironment: 'jest-environment-jsdom',
      transform: {
        '^.+\\.(js|jsx|ts|tsx)$': ['ts-jest', {
          tsconfig: 'tsconfig.json',
          useESM: false,
          jsx: 'react-jsx',
        }],
      },
      testMatch: ['**/__tests__/components/**/*.test.(jsx|tsx)'],
      testPathIgnorePatterns: ['/node_modules/', '/services/'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
      transformIgnorePatterns: ['/node_modules/(?!(@testing-library)/)'],
    },
  ],
}

export default config
