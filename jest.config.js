const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^multiformats/hashes/sha2$': '<rootDir>/src/lib/p2p/__mocks__/multiformats.js',
    '^multiformats/cid$': '<rootDir>/src/lib/p2p/__mocks__/multiformats.js',
    '^multiformats$': '<rootDir>/src/lib/p2p/__mocks__/multiformats.js',
    '^helia$': '<rootDir>/src/lib/p2p/__mocks__/helia.js',
    '^libp2p$': '<rootDir>/src/lib/p2p/__mocks__/libp2p.js',
    '^@orbitdb/core$': '<rootDir>/src/lib/p2p/__mocks__/orbitdb.js',
  },
  testEnvironment: 'jest-environment-jsdom',
  testMatch: [
    '**/__tests__/**/*.{js,jsx,ts,tsx}',
    '**/*.{spec,test}.{js,jsx,ts,tsx}'
  ],
  testPathIgnorePatterns: [
    '<rootDir>/src/lib/p2p/__tests__/test-utils.ts',
    '<rootDir>/src/lib/p2p/__tests__/crypto-identity.test.ts',
    '<rootDir>/src/lib/p2p/__tests__/content-manager.test.ts',
    '<rootDir>/src/lib/p2p/__tests__/collection-cqrs.test.ts',
    '<rootDir>/src/lib/p2p/__tests__/p2p-system.test.ts',
    '<rootDir>/src/lib/p2p/__integration__',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(multiformats|@libp2p|@chainsafe|@multiformats|uint8arrays|helia|@orbitdb|interface-datastore|datastore-core|blockstore-core|ipfs-unixfs|@ipld|dag-|it-|protons|@helia)/)',
  ],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/app/**',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  }
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)