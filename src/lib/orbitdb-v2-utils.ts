// OrbitDB v2 Utilities
// Handles proper iteration and reading from OrbitDB v2 databases

export interface IteratorOptions {
  limit?: number
  reverse?: boolean
  gt?: string
  gte?: string
  lt?: string
  lte?: string
}

/**
 * Reads entries from an OrbitDB v2 database using async iteration
 * Works with eventlog, docstore, and keyvalue databases
 */
export async function readDatabaseEntries(
  db: any,
  options: IteratorOptions = {}
): Promise<any[]> {
  if (!db) {
    console.warn('[OrbitDB Utils] Database not initialized')
    return []
  }

  const entries: any[] = []
  const { limit = 100, reverse = false, gt, gte, lt, lte } = options

  try {
    // Log database type for debugging
    const dbType = db.type || db._type || 'unknown'
    const dbAddress = db.address?.toString() || 'no-address'
    console.log(`[OrbitDB Utils] Reading from ${dbType} database: ${dbAddress}`)

    // Check if database is ready
    if (db.opened === false) {
      console.warn('[OrbitDB Utils] Database not yet opened, waiting...')
      if (db.open) {
        await db.open()
      }
    }

    // Different approaches based on database type
    if (dbType === 'events' || dbType === 'eventlog') {
      // EventLog database - use iterator
      console.log('[OrbitDB Utils] Using eventlog iterator approach')
      
      // Check if iterator exists and is a function
      if (typeof db.iterator === 'function') {
        console.log('[OrbitDB Utils] iterator() is available')
        
        const iteratorOpts = {
          amount: limit,
          reverse,
          ...(gt && { gt }),
          ...(gte && { gte }),
          ...(lt && { lt }),
          ...(lte && { lte })
        }
        
        const iterator = db.iterator(iteratorOpts)
        
        // Check if we have an async iterable
        if (iterator && typeof iterator[Symbol.asyncIterator] === 'function') {
          console.log('[OrbitDB Utils] Using async iterator')
          
          for await (const entry of iterator) {
            entries.push(entry)
            if (entries.length >= limit) break
          }
        } else if (iterator && typeof iterator.next === 'function') {
          // Fallback to manual iteration if needed
          console.log('[OrbitDB Utils] Using manual iteration')
          
          let result = await iterator.next()
          while (!result.done && entries.length < limit) {
            entries.push(result.value)
            result = await iterator.next()
          }
        } else {
          console.warn('[OrbitDB Utils] Iterator returned unexpected type:', typeof iterator)
        }
      } else if (typeof db.all === 'function') {
        // Fallback to all() method if available
        console.log('[OrbitDB Utils] Falling back to all() method')
        const allEntries = await db.all()
        
        // Apply filtering and limits
        let filtered = allEntries
        if (reverse) {
          filtered = filtered.reverse()
        }
        entries.push(...filtered.slice(0, limit))
      } else {
        console.error('[OrbitDB Utils] No suitable method to read entries')
      }
      
    } else if (dbType === 'keyvalue' || dbType === 'kv') {
      // KeyValue database
      console.log('[OrbitDB Utils] Using keyvalue approach')
      
      if (typeof db.all === 'function') {
        const kvEntries = await db.all()
        // Convert to array format
        Object.entries(kvEntries).forEach(([key, value]) => {
          entries.push({ key, value })
          if (entries.length >= limit) return
        })
      } else if (typeof db.get === 'function') {
        // If no all(), we'd need to know the keys
        console.warn('[OrbitDB Utils] KeyValue DB requires key knowledge for iteration')
      }
      
    } else if (dbType === 'docstore' || dbType === 'documents') {
      // Document store
      console.log('[OrbitDB Utils] Using docstore approach')
      
      if (typeof db.query === 'function') {
        // Use query for filtering
        const docs = await db.query((_doc: any) => true, { limit })
        entries.push(...docs)
      } else if (typeof db.all === 'function') {
        const allDocs = await db.all()
        entries.push(...allDocs.slice(0, limit))
      }
      
    } else {
      // Unknown type, try generic approaches
      console.log('[OrbitDB Utils] Unknown DB type, trying generic approaches')
      
      if (typeof db.all === 'function') {
        const allEntries = await db.all()
        entries.push(...(Array.isArray(allEntries) ? allEntries.slice(0, limit) : []))
      }
    }

    console.log(`[OrbitDB Utils] Read ${entries.length} entries`)
    return entries

  } catch (error) {
    console.error('[OrbitDB Utils] Error reading database:', error)
    
    // One-time warning for deprecated methods
    if (error instanceof Error && error.message.includes('collect')) {
      console.warn('[OrbitDB Utils]   DEPRECATED: iterator().collect() is not available in OrbitDB v2')
      console.warn('[OrbitDB Utils] Use async iteration or all() method instead')
    }
    
    return []
  }
}

/**
 * Normalizes an entry from OrbitDB to a consistent shape
 */
export function normalizeEntry(entry: any): any {
  if (!entry) return null

  // Check different possible entry structures
  const value = entry.value || entry.payload?.value || entry
  
  // Return normalized structure
  return {
    // Core document fields
    id: value.id,
    cid: value.cid,
    title: value.title,
    description: value.description,
    filename: value.filename,
    mimeType: value.mimeType,
    size: value.size,
    
    // Authorship
    authorPubKey: value.authorPubKey,
    signature: value.signature,
    timestamp: value.timestamp,
    
    // Versioning
    version: value.version || 1,
    deleted: value.deleted || false,
    forkOf: value.forkOf,
    
    // OrbitDB metadata
    hash: entry.hash || entry.cid,
    clock: entry.clock,
    seq: entry.seq,
    
    // Raw data reference
    _raw: entry
  }
}

/**
 * Waits for a database to be ready before proceeding
 */
export async function ensureDatabaseReady(db: any): Promise<boolean> {
  if (!db) {
    console.error('[OrbitDB Utils] No database provided')
    return false
  }

  try {
    // For OrbitDB v2, databases are ready immediately after open
    // The 'opened' property doesn't exist in v2
    
    // Check if database has an address (indicates it's opened)
    if (db.address) {
      console.log('[OrbitDB Utils] Database has address, considered ready')
      return true
    }

    // If database has an open method and needs opening
    if (typeof db.open === 'function') {
      console.log('[OrbitDB Utils] Opening database...')
      await db.open()
      return true
    }

    // For OrbitDB v2, if we can access the iterator, it's ready
    if (typeof db.iterator === 'function' || typeof db.all === 'function') {
      console.log('[OrbitDB Utils] Database has data access methods, considered ready')
      return true
    }

    // Default: assume ready since OrbitDB v2 doesn't have complex ready states
    console.log('[OrbitDB Utils] Assuming database is ready (OrbitDB v2)')
    return true

  } catch (error) {
    console.error('[OrbitDB Utils] Error ensuring database ready:', error)
    return false
  }
}

/**
 * Client-side only wrapper for Next.js
 */
export function isClientSide(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * Builds a document list from eventlog entries, handling tombstones
 */
export function buildDocumentState(entries: any[]): Map<string, any> {
  const documents = new Map<string, any>()
  
  for (const entry of entries) {
    const doc = normalizeEntry(entry)
    
    if (!doc || !doc.id) continue
    
    if (doc.deleted) {
      // Mark as deleted but keep in history
      const existing = documents.get(doc.id)
      if (existing) {
        existing.deleted = true
        existing.deletedAt = doc.timestamp
      }
    } else {
      // Add or update document
      documents.set(doc.id, doc)
    }
  }
  
  return documents
}