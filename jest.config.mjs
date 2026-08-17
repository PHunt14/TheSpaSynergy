/** @type {import('jest').Config} */
const config = {
  projects: [
    // Unit + API integration tests (Node environment)
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform: {
        '\\.[jt]sx?$': ['ts-jest', {
          tsconfig: 'tsconfig.json',
          useESM: true,
          jsx: 'react-jsx',
        }],
      },
      extensionsToTreatAsEsm: ['.ts', '.jsx'],
      testMatch: ['**/__tests__/**/*.test.mjs', '**/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/services/'],
      transformIgnorePatterns: ['/node_modules/'],
    },
    // React component tests (jsdom environment)
    {
      displayName: 'components',
      testEnvironment: 'jest-environment-jsdom',
      transform: {
        '^.+\\.(js|jsx|ts|tsx|mjs)$': ['ts-jest', {
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
      transformIgnorePatterns: ['/node_modules/(?!(@testing-library|react-datepicker|clsx|rxjs)/)'],
    },
  ],
}

export default config
