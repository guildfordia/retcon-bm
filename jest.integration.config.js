const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

// Integration test configuration - NO MOCKS, real components
const integrationJestConfig = {
  displayName: 'Integration Tests',
  testMatch: [
    '**/__integration__/**/*.{js,jsx,ts,tsx}',
    '**/*.integration.{js,jsx,ts,tsx}'
  ],
  testEnvironment: 'node', // Node environment for real P2P tests
  setupFilesAfterEnv: ['<rootDir>/jest.integration.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Longer timeouts for real P2P operations
  testTimeout: 30000,
  maxWorkers: 2, // Limit parallelism for P2P tests
  // Transform ES modules in node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(@orbitdb|@chainsafe|@libp2p|@multiformats|multiformats|uint8arrays|helia|it-|protons|@helia|interface-|blockstore-|datastore-|ipfs-|@ipld)/)',
  ],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  collectCoverageFrom: [
    'src/lib/p2p/**/*.{js,jsx,ts,tsx}',
    '!src/lib/p2p/__tests__/**',
    '!src/lib/p2p/__mocks__/**',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage-integration',
}

module.exports = createJestConfig(integrationJestConfig)