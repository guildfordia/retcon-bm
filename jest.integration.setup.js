// Integration test setup - NO MOCKS, real environment
import { rmSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// Test data directories
const TEST_DATA_DIR = join(process.cwd(), 'test-data')
const ORBITDB_DIR = join(TEST_DATA_DIR, 'orbitdb')

// Global setup
beforeAll(async () => {
  // Clean up any previous test data
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  }

  // Create fresh test directories
  mkdirSync(TEST_DATA_DIR, { recursive: true })
  mkdirSync(ORBITDB_DIR, { recursive: true })

  console.log('🧪 Integration test environment prepared')
})

// Clean up after all tests
afterAll(async () => {
  // Clean up test data
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  }

  console.log('🧹 Integration test cleanup completed')
})

// Increase timeout for P2P operations
jest.setTimeout(30000)

// Real crypto for Node.js (not mocked)
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = require('crypto')
  globalThis.crypto = webcrypto
}

// Add fetch polyfill for Node.js
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = require('node-fetch')
}