// Stub implementation for P2P loader to satisfy TypeScript compiler
// This enables test pages to build without actual P2P dependencies

export interface P2PSystemMock {
  initialize: () => Promise<void>
  getPeerInfo: () => Promise<{ peerId: string; multiaddrs: string[]; connectedPeers: number }>
  getKnownCollections: () => Promise<any[]>
  getDocuments: (collectionId: string) => Promise<any[]>
  getOrCreateCollection: (name: string, options?: any) => Promise<any>
  publishDocument: (collectionId: string, file: File, metadata: any) => Promise<any>
  shutdown: () => Promise<void>
}

export class MockP2PSystem implements P2PSystemMock {
  private initialized = false
  private mockCollections: any[] = []
  private mockDocuments: Map<string, any[]> = new Map()

  async initialize(): Promise<void> {
    this.initialized = true
    // Simulate initialization delay
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  async getPeerInfo(): Promise<{ peerId: string; multiaddrs: string[]; connectedPeers: number }> {
    return {
      peerId: `12D3KooW${Math.random().toString(36).substr(2, 40)}`,
      multiaddrs: ['/ip4/127.0.0.1/tcp/4001', '/ip6/::1/tcp/4001'],
      connectedPeers: Math.floor(Math.random() * 5)
    }
  }

  async getKnownCollections(): Promise<any[]> {
    return this.mockCollections
  }

  async getDocuments(collectionId: string): Promise<any[]> {
    return this.mockDocuments.get(collectionId) || []
  }

  async getOrCreateCollection(name: string, options?: any): Promise<any> {
    const collection = {
      id: `collection-${Date.now()}`,
      name,
      description: options?.description || '',
      createdAt: new Date().toISOString()
    }
    this.mockCollections.push(collection)
    this.mockDocuments.set(collection.id, [])
    return collection
  }

  async publishDocument(collectionId: string, file: File, metadata: any): Promise<any> {
    const document = {
      _id: `doc-${Date.now()}`,
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags || [],
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      ipfsCID: `Qm${Math.random().toString(36).substr(2, 44)}`,
      timestamp: Date.now(),
      provenance: { version: 1 }
    }

    const docs = this.mockDocuments.get(collectionId) || []
    docs.push(document)
    this.mockDocuments.set(collectionId, docs)

    return document
  }

  async shutdown(): Promise<void> {
    this.initialized = false
    this.mockCollections = []
    this.mockDocuments.clear()
  }
}

// Export for compatibility
export async function loadP2PSystem(): Promise<MockP2PSystem> {
  return new MockP2PSystem()
}