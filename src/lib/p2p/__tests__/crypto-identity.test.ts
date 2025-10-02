/**
 * Tests for CryptoIdentityManager
 */

import { CryptoIdentityManager } from '../crypto-identity'
import { generateTestKeyPair } from './test-utils'

describe('CryptoIdentityManager', () => {
  let manager: CryptoIdentityManager
  let keyPair: KeyPair

  beforeEach(async () => {
    manager = new CryptoIdentityManager()
    keyPair = await generateTestKeyPair()
    await manager.initialize(keyPair)
  })

  describe('initialization', () => {
    it('should initialize with a key pair', async () => {
      const info = manager.getIdentityInfo()
      expect(info.authorDID).toBeDefined()
      expect(info.authorDID).toMatch(/^did:p2p:/)
      expect(info.publicKey).toBeDefined()
      expect(info.lamportClock).toBe(0)
    })

    it('should generate a key pair if none provided', async () => {
      const newManager = new CryptoIdentityManager()
      await newManager.initialize()

      const info = newManager.getIdentityInfo()
      expect(info.authorDID).toBeDefined()
      expect(info.publicKey).toBeDefined()
    })
  })

  describe('signData', () => {
    it('should sign data and create crypto identity', async () => {
      const testData = { message: 'Hello World' }
      const identity = await manager.signData(testData)

      expect(identity.authorDID).toBeDefined()
      expect(identity.publicKey).toBeDefined()
      expect(identity.signature).toBeDefined()
      expect(identity.keyAlgorithm).toBe('ECDSA-P256')
      expect(identity.lamportClock).toBe(1)
      expect(identity.timestamp).toBeDefined()
    })

    it('should increment Lamport clock on each signature', async () => {
      const testData = { message: 'Test' }

      const identity1 = await manager.signData(testData)
      expect(identity1.lamportClock).toBe(1)

      const identity2 = await manager.signData(testData)
      expect(identity2.lamportClock).toBe(2)

      const identity3 = await manager.signData(testData)
      expect(identity3.lamportClock).toBe(3)
    })

    it('should generate proof-of-work when required', async () => {
      const testData = { message: 'Test with PoW' }
      const identity = await manager.signData(testData, true, 2)

      expect(identity.proofOfWork).toBeDefined()
      expect(identity.proofOfWork!.difficulty).toBe(2)
      expect(identity.proofOfWork!.nonce).toBeGreaterThanOrEqual(0)
      expect(identity.proofOfWork!.hash).toBeDefined()
      expect(identity.proofOfWork!.hash.startsWith('00')).toBe(true)
    })
  })

  describe('verifyIdentity', () => {
    it('should verify a valid signed identity', async () => {
      const testData = { message: 'Verify me' }
      const identity = await manager.signData(testData)

      const result = await manager.verifyIdentity(testData, identity)
      expect(result.valid).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('should reject identity with mismatched data', async () => {
      const testData = { message: 'Original' }
      const identity = await manager.signData(testData)

      const differentData = { message: 'Modified' }
      const result = await manager.verifyIdentity(differentData, identity)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('Invalid signature')
    })

    it('should reject identity with wrong DID', async () => {
      const testData = { message: 'Test' }
      const identity = await manager.signData(testData)

      // Tamper with DID
      const tamperedIdentity = { ...identity, authorDID: 'did:p2p:wrong' }
      const result = await manager.verifyIdentity(testData, tamperedIdentity)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('DID does not match')
    })

    it('should verify proof-of-work when present', async () => {
      const testData = { message: 'Test with PoW' }
      const identity = await manager.signData(testData, true, 2)

      const result = await manager.verifyIdentity(testData, identity)
      expect(result.valid).toBe(true)
    })

    it('should reject invalid proof-of-work', async () => {
      const testData = { message: 'Test' }
      const identity = await manager.signData(testData, true, 2)

      // Tamper with PoW
      identity.proofOfWork!.nonce = 999999
      const result = await manager.verifyIdentity(testData, identity)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('Invalid proof-of-work')
    })

    it('should check timestamp reasonableness', async () => {
      const testData = { message: 'Test' }
      const identity = await manager.signData(testData)

      // Set timestamp to 2 hours ago
      identity.timestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

      const result = await manager.verifyIdentity(testData, identity)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('Timestamp too far')
    })
  })

  describe('updateLamportClock', () => {
    it('should update clock to max + 1', () => {
      const info1 = manager.getIdentityInfo()
      expect(info1.lamportClock).toBe(0)

      manager.updateLamportClock(5)
      const info2 = manager.getIdentityInfo()
      expect(info2.lamportClock).toBe(6)

      manager.updateLamportClock(3)
      const info3 = manager.getIdentityInfo()
      expect(info3.lamportClock).toBe(7)
    })
  })

  describe('compareOperations', () => {
    it('should sort by Lamport clock first', () => {
      const op1 = {
        identity: {
          authorDID: 'did:p2p:a',
          publicKey: 'key1',
          keyAlgorithm: 'ECDSA-P256' as const,
          signature: 'sig1',
          lamportClock: 5,
          timestamp: '2024-01-01T00:00:00Z'
        }
      }

      const op2 = {
        identity: {
          authorDID: 'did:p2p:b',
          publicKey: 'key2',
          keyAlgorithm: 'ECDSA-P256' as const,
          signature: 'sig2',
          lamportClock: 3,
          timestamp: '2024-01-02T00:00:00Z'
        }
      }

      const result = CryptoIdentityManager.compareOperations(op1, op2)
      expect(result).toBeGreaterThan(0) // op1 > op2 because higher clock
    })

    it('should use timestamp as secondary sort', () => {
      const op1 = {
        identity: {
          authorDID: 'did:p2p:a',
          publicKey: 'key1',
          keyAlgorithm: 'ECDSA-P256' as const,
          signature: 'sig1',
          lamportClock: 5,
          timestamp: '2024-01-02T00:00:00Z'
        }
      }

      const op2 = {
        identity: {
          authorDID: 'did:p2p:b',
          publicKey: 'key2',
          keyAlgorithm: 'ECDSA-P256' as const,
          signature: 'sig2',
          lamportClock: 5,
          timestamp: '2024-01-01T00:00:00Z'
        }
      }

      const result = CryptoIdentityManager.compareOperations(op1, op2)
      expect(result).toBeGreaterThan(0) // op1 > op2 because later timestamp
    })

    it('should use DID as tie-breaker', () => {
      const op1 = {
        identity: {
          authorDID: 'did:p2p:bbb',
          publicKey: 'key1',
          keyAlgorithm: 'ECDSA-P256' as const,
          signature: 'sig1',
          lamportClock: 5,
          timestamp: '2024-01-01T00:00:00Z'
        }
      }

      const op2 = {
        identity: {
          authorDID: 'did:p2p:aaa',
          publicKey: 'key2',
          keyAlgorithm: 'ECDSA-P256' as const,
          signature: 'sig2',
          lamportClock: 5,
          timestamp: '2024-01-01T00:00:00Z'
        }
      }

      const result = CryptoIdentityManager.compareOperations(op1, op2)
      expect(result).toBeGreaterThan(0) // op1 > op2 because 'bbb' > 'aaa'
    })
  })
})