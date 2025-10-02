/**
 * Test utilities and mocks for P2P system tests
 */

import { KeyPair, P2PConfig } from '../types'

export async function generateTestKeyPair(): Promise<KeyPair> {
  return await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )
}

export function createTestConfig(userId: string = 'test-user'): P2PConfig {
  return {
    userId,
    storage: {
      directory: `test-p2p-${userId}`,
      maxSize: 100 * 1024 * 1024 // 100MB
    },
    network: {
      bootstrap: [],
      maxPeers: 5
    },
    search: {
      indexSize: 100,
      updateInterval: 5000
    },
    security: {
      requireProofOfWork: false,
      rateLimits: {
        maxOperationsPerMinute: 100,
        maxBytesPerOperation: 1024 * 1024,
        maxBytesPerMinute: 10 * 1024 * 1024,
        proofOfWorkDifficulty: 2
      }
    },
    schemas: {
      operationSchema: '1.0.0',
      activitySchema: '1.0.0'
    }
  }
}

export function createMockOrbitDB() {
  return {
    open: jest.fn().mockResolvedValue({
      address: { toString: () => 'mock-address' },
      events: {
        on: jest.fn()
      },
      add: jest.fn().mockResolvedValue({}),
      get: jest.fn(),
      put: jest.fn(),
      del: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      all: jest.fn().mockResolvedValue([]),
      iterator: jest.fn().mockReturnValue({
        collect: jest.fn().mockResolvedValue([])
      })
    })
  }
}

export function createMockHelia() {
  return {
    fs: {
      addBytes: jest.fn().mockResolvedValue({ cid: { toString: () => 'mock-cid-123' } }),
      cat: jest.fn().mockImplementation(function* () {
        yield new Uint8Array([1, 2, 3])
      })
    },
    pins: {
      add: jest.fn().mockResolvedValue({}),
      rm: jest.fn().mockResolvedValue({})
    }
  }
}

export function createTestFile(name: string = 'test.txt', content: string = 'test content'): File {
  const blob = new Blob([content], { type: 'text/plain' })
  return new File([blob], name, { type: 'text/plain' })
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}