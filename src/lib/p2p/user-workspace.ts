/**
 * User Activity System
 * Manages public activity stream for users - NO PRIVATE DATA
 * - Activity DB (EventLog) = Public activity stream
 * All user actions are public and discoverable by design
 */

import { FeedEntry, KeyPair, P2PConfig, P2PError } from './types'
import { ensureDatabaseReady, readDatabaseEntries } from '../orbitdb-v2-utils'

export class UserActivity {
  private orbitdb: any
  private activityDB: any | null = null
  private userKeyPair: KeyPair | null = null
  private publicKey: string = ''
  private userId: string
  private config: P2PConfig

  constructor(orbitdb: any, userId: string, config: P2PConfig) {
    this.orbitdb = orbitdb
    this.userId = userId
    this.config = config
  }

  /**
   * Initialize the user public activity system
   */
  async initialize(
    userKeyPair: KeyPair,
    activityAddress?: string
  ): Promise<{activityAddress: string}> {
    console.log(` UserActivity.initialize() for: ${this.userId}`)

    this.userKeyPair = userKeyPair
    this.publicKey = await this.exportPublicKey(userKeyPair.publicKey)

    // Initialize Public Activity DB (EventLog)
    const activityName = activityAddress || `${this.userId}-activity`
    console.log('   Opening public activity database:', activityName)

    this.activityDB = await this.orbitdb.open(activityName, {
      type: 'eventlog',
      create: !activityAddress,
      sync: true, // Public activity, always synced
      accessController: {
        type: 'orbitdb',
        write: [this.publicKey] // Only user can write to their activity
      }
    })

    await ensureDatabaseReady(this.activityDB)
    console.log('   Public activity database ready:', this.activityDB.address.toString())

    // Set up event listeners
    this.setupEventListeners()

    return {
      activityAddress: this.activityDB.address.toString()
    }
  }

  // Public Activity Management

  /**
   * Add an entry to the user's public activity stream
   */
  async addActivityEntry(
    type: FeedEntry['type'],
    data: any,
    options: {
      metadata?: Record<string, any>
    } = {}
  ): Promise<FeedEntry> {
    console.log(` Adding public activity entry: ${type}`)

    const entry: FeedEntry = {
      type,
      timestamp: Date.now(),
      data: {
        ...data,
        ...options.metadata
      },
      authorDID: this.userId,
      signature: ''
    }

    // Sign the entry
    entry.signature = await this.signActivityEntry(entry)

    await this.activityDB!.add(entry)
    console.log('   Public activity entry added')

    return entry
  }

  /**
   * Announce document publication
   */
  async announcePublication(
    documentId: string,
    collectionId: string,
    title: string
  ): Promise<FeedEntry> {
    return this.addActivityEntry('publish', {
      documentId,
      collectionId,
      title,
      publishedAt: Date.now()
    })
  }

  /**
   * Announce following a collection
   */
  async announceFollow(collectionId: string, collectionName: string): Promise<FeedEntry> {
    return this.addActivityEntry('follow', {
      collectionId,
      collectionName,
      followedAt: Date.now()
    })
  }

  /**
   * Add a comment entry
   */
  async addComment(
    documentId: string,
    collectionId: string,
    comment: string
  ): Promise<FeedEntry> {
    return this.addActivityEntry('comment', {
      documentId,
      collectionId,
      comment,
      commentedAt: Date.now()
    })
  }

  /**
   * Get activity entries
   */
  async getActivityEntries(options: {
    type?: FeedEntry['type']
    limit?: number
    since?: number
  } = {}): Promise<FeedEntry[]> {
    if (!this.activityDB) return []

    try {
      const entries = await readDatabaseEntries(this.activityDB, {
        limit: options.limit || 100
      })

      let results = entries
        .map(entry => entry.value || entry.payload?.value || entry)
        .filter((entry: FeedEntry) => {
          if (options.type && entry.type !== options.type) {
            return false
          }
          if (options.since && entry.timestamp < options.since) {
            return false
          }
          return true
        })

      // Sort by timestamp (newest first)
      results.sort((a: FeedEntry, b: FeedEntry) => b.timestamp - a.timestamp)

      return results
    } catch (error) {
      console.error('Failed to get activity entries:', error)
      return []
    }
  }

  /**
   * Get activity statistics
   */
  async getActivityStats() {
    const activityEntries = await this.getActivityEntries({ limit: 1000 })

    const entriesByType = activityEntries.reduce((acc, entry) => {
      acc[entry.type] = (acc[entry.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      activity: {
        total: activityEntries.length,
        byType: entriesByType,
        lastEntry: Math.max(...activityEntries.map(e => e.timestamp), 0)
      }
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    // OrbitDB handles cleanup internally
    this.activityDB = null
    console.log(` UserActivity destroyed for: ${this.userId}`)
  }

  // Private methods

  private async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', publicKey)
    return btoa(String.fromCharCode(...new Uint8Array(exported)))
  }

  private async signActivityEntry(entry: FeedEntry): Promise<string> {
    if (!this.userKeyPair) throw new P2PError('No key pair available', 'NO_KEYPAIR')

    const { signature: _, ...dataToSign } = entry
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(JSON.stringify(dataToSign))

    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      this.userKeyPair.privateKey,
      dataBuffer
    )

    return btoa(String.fromCharCode(...new Uint8Array(signature)))
  }

  private setupEventListeners(): void {
    // Listen for activity replication from other peers
    this.activityDB?.events.on('replicated', () => {
      console.log(' Public activity replicated from network')
    })

    this.activityDB?.events.on('write', () => {
      console.log(' Public activity entry added')
    })
  }
}