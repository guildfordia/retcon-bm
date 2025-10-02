/**
 * Cryptographic Identity System
 * Handles deterministic DIDs, signing, verification, and proof-of-work
 */

import { sha256 } from 'multiformats/hashes/sha2'
import { CryptoIdentity, ProofOfWork, KeyPair } from './types'

export class CryptoIdentityManager {
  private keyPair: KeyPair | null = null
  private publicKeyB64: string = ''
  private authorDID: string = ''
  private lamportClock: number = 0

  /**
   * Initialize with a key pair
   */
  async initialize(keyPair?: KeyPair): Promise<void> {
    this.keyPair = keyPair || await this.generateKeyPair()
    this.publicKeyB64 = await this.exportPublicKey(this.keyPair.publicKey)
    this.authorDID = await this.generateDIDFromPublicKey(this.publicKeyB64)

    console.log(' CryptoIdentity initialized')
    console.log('  DID:', this.authorDID.substring(0, 20) + '...')
    console.log('  Public Key:', this.publicKeyB64.substring(0, 20) + '...')
  }

  /**
   * Generate a new ECDSA key pair
   */
  private async generateKeyPair(): Promise<KeyPair> {
    return await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )
  }

  /**
   * Export public key as base64
   */
  private async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', publicKey)
    return btoa(String.fromCharCode(...new Uint8Array(exported)))
  }

  /**
   * Generate deterministic DID from public key
   */
  private async generateDIDFromPublicKey(publicKeyB64: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(publicKeyB64)
    const hash = await sha256.digest(data)
    const hashArray = new Uint8Array(hash.bytes)

    // Convert to base58-like encoding for readable DID
    const hashB64 = btoa(String.fromCharCode(...hashArray))
    return `did:p2p:${hashB64.substring(0, 16)}`
  }

  /**
   * Sign data and create crypto identity
   */
  async signData(data: any, requirePoW: boolean = false, difficulty: number = 4): Promise<CryptoIdentity> {
    if (!this.keyPair) {
      throw new Error('Identity not initialized')
    }

    // Increment logical clock
    this.lamportClock += 1

    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(JSON.stringify(data))

    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      this.keyPair.privateKey,
      dataBuffer
    )

    const identity: CryptoIdentity = {
      authorDID: this.authorDID,
      publicKey: this.publicKeyB64,
      keyAlgorithm: 'ECDSA-P256',
      signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
      lamportClock: this.lamportClock,
      timestamp: new Date().toISOString()
    }

    // Add proof-of-work if required
    if (requirePoW) {
      identity.proofOfWork = await this.generateProofOfWork(data, identity, difficulty)
    }

    return identity
  }

  /**
   * Verify a signed identity
   */
  async verifyIdentity(data: any, identity: CryptoIdentity): Promise<{valid: boolean, reason?: string}> {
    try {
      // 1. Verify DID matches public key
      const expectedDID = await this.generateDIDFromPublicKey(identity.publicKey)
      if (identity.authorDID !== expectedDID) {
        return { valid: false, reason: 'DID does not match public key' }
      }

      // 2. Verify signature
      const publicKey = await this.importPublicKey(identity.publicKey)
      const encoder = new TextEncoder()
      const dataBuffer = encoder.encode(JSON.stringify(data))
      const signature = Uint8Array.from(atob(identity.signature), c => c.charCodeAt(0))

      const signatureValid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        publicKey,
        signature,
        dataBuffer
      )

      if (!signatureValid) {
        return { valid: false, reason: 'Invalid signature' }
      }

      // 3. Verify proof-of-work if present
      if (identity.proofOfWork) {
        const powValid = await this.verifyProofOfWork(data, identity, identity.proofOfWork)
        if (!powValid) {
          return { valid: false, reason: 'Invalid proof-of-work' }
        }
      }

      // 4. Check timestamp is reasonable (within 1 hour)
      const now = Date.now()
      const identityTime = new Date(identity.timestamp).getTime()
      const hourInMs = 60 * 60 * 1000

      if (Math.abs(now - identityTime) > hourInMs) {
        return { valid: false, reason: 'Timestamp too far from current time' }
      }

      return { valid: true }

    } catch (error) {
      return { valid: false, reason: `Verification error: ${error}` }
    }
  }

  /**
   * Generate proof-of-work
   */
  private async generateProofOfWork(
    data: any,
    identity: CryptoIdentity,
    difficulty: number
  ): Promise<ProofOfWork> {
    const target = '0'.repeat(difficulty)
    let nonce = 0
    let hash = ''

    // Create challenge string
    const challenge = JSON.stringify({
      data: JSON.stringify(data),
      authorDID: identity.authorDID,
      timestamp: identity.timestamp,
      lamportClock: identity.lamportClock
    })

    console.log(` Mining proof-of-work (difficulty: ${difficulty})...`)

    while (true) {
      const attempt = challenge + nonce
      const encoder = new TextEncoder()
      const hashDigest = await sha256.digest(encoder.encode(attempt))
      hash = Array.from(new Uint8Array(hashDigest.bytes))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      if (hash.startsWith(target)) {
        console.log(`   PoW found! Nonce: ${nonce}, Hash: ${hash.substring(0, 16)}...`)
        break
      }

      nonce++
      if (nonce % 10000 === 0) {
        console.log(`   Tried ${nonce} nonces...`)
      }
    }

    return {
      nonce,
      difficulty,
      target,
      hash
    }
  }

  /**
   * Verify proof-of-work
   */
  private async verifyProofOfWork(
    data: any,
    identity: CryptoIdentity,
    pow: ProofOfWork
  ): Promise<boolean> {
    try {
      const challenge = JSON.stringify({
        data: JSON.stringify(data),
        authorDID: identity.authorDID,
        timestamp: identity.timestamp,
        lamportClock: identity.lamportClock
      })

      const attempt = challenge + pow.nonce
      const encoder = new TextEncoder()
      const hashDigest = await sha256.digest(encoder.encode(attempt))
      const hash = Array.from(new Uint8Array(hashDigest.bytes))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const target = '0'.repeat(pow.difficulty)
      return hash === pow.hash && hash.startsWith(target)

    } catch (error) {
      console.error('PoW verification error:', error)
      return false
    }
  }

  /**
   * Import public key from base64
   */
  private async importPublicKey(publicKeyB64: string): Promise<CryptoKey> {
    const keyData = Uint8Array.from(atob(publicKeyB64), c => c.charCodeAt(0))
    return await crypto.subtle.importKey(
      'spki',
      keyData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
  }

  /**
   * Update logical clock based on received clock
   */
  updateLamportClock(receivedClock: number): void {
    this.lamportClock = Math.max(this.lamportClock, receivedClock) + 1
  }

  /**
   * Get current identity info
   */
  getIdentityInfo() {
    return {
      authorDID: this.authorDID,
      publicKey: this.publicKeyB64,
      lamportClock: this.lamportClock
    }
  }

  /**
   * Deterministic merge order for operations
   */
  static compareOperations(a: { identity: CryptoIdentity }, b: { identity: CryptoIdentity }): number {
    // 1. Lamport clock first
    if (a.identity.lamportClock !== b.identity.lamportClock) {
      return a.identity.lamportClock - b.identity.lamportClock
    }

    // 2. ISO timestamp second
    const timeA = new Date(a.identity.timestamp).getTime()
    const timeB = new Date(b.identity.timestamp).getTime()
    if (timeA !== timeB) {
      return timeA - timeB
    }

    // 3. Author DID as tie-breaker (deterministic)
    return a.identity.authorDID.localeCompare(b.identity.authorDID)
  }
}