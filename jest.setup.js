// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock crypto API for Node.js environment
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = require('crypto')
  globalThis.crypto = webcrypto
}

// Mock window object for browser-specific code
if (typeof window === 'undefined') {
  global.window = {
    sessionStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    },
    localStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    }
  }
}

