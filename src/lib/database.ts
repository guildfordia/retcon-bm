import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import bcrypt from 'bcryptjs'

let db: Database.Database | null = null

export function getDatabase() {
  if (!db) {
    // Read database path from environment variable or use default
    const dbUrl = process.env.DATABASE_URL || 'file:./rbm.db'
    
    // Parse the database path from the URL
    let dbPath: string
    if (dbUrl.startsWith('file:')) {
      dbPath = dbUrl.slice(5) // Remove 'file:' prefix
    } else {
      dbPath = dbUrl
    }
    
    // Ensure the parent directory exists
    const dbDir = dirname(dbPath)
    try {
      mkdirSync(dbDir, { recursive: true })
      console.log(`Database directory ensured at: ${dbDir}`)
    } catch (error) {
      console.error(`Failed to create database directory: ${error}`)
    }
    
    // Log the resolved database path
    console.log(`Opening database at: ${dbPath}`)
    
    db = new Database(dbPath)
    initializeDatabase()
  }
  return db
}

function initializeDatabase() {
  if (!db) return

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_approved BOOLEAN DEFAULT FALSE,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Collections table (all collections are public)
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      document_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users (id)
    )
  `)

  // Documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      document_type TEXT DEFAULT 'quote' CHECK(document_type IN ('quote', 'link', 'image')),
      filename TEXT,
      original_filename TEXT,
      mime_type TEXT,
      size INTEGER,
      uploaded_by TEXT NOT NULL,
      collection_id TEXT,
      orbit_db_address TEXT,
      ipfs_hash TEXT,
      metadata TEXT,
      is_forked BOOLEAN DEFAULT FALSE,
      forked_from TEXT,
      fork_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users (id),
      FOREIGN KEY (collection_id) REFERENCES collections (id),
      FOREIGN KEY (forked_from) REFERENCES documents (id)
    )
  `)

  // Migration: Add document_type and metadata columns if they don't exist
  try {
    db.exec(`ALTER TABLE documents ADD COLUMN document_type TEXT DEFAULT 'quote' CHECK(document_type IN ('quote', 'link', 'image'))`)
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE documents ADD COLUMN metadata TEXT`)
  } catch (e) {
    // Column already exists
  }

  // Make filename and original_filename nullable for quote and link types
  try {
    // SQLite doesn't support ALTER COLUMN directly, so we check if data needs migration
    const hasNonNullableFiles = db.prepare(`
      SELECT COUNT(*) as count FROM pragma_table_info('documents')
      WHERE name IN ('filename', 'original_filename') AND [notnull] = 1
    `).get() as { count: number }

    if (hasNonNullableFiles.count > 0) {
      console.log('Note: filename columns are NOT NULL. Consider migrating data if using quote/link types.')
    }
  } catch (e) {
    // Ignore check errors
  }

  // Document forks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_forks (
      id TEXT PRIMARY KEY,
      original_document_id TEXT NOT NULL,
      forked_document_id TEXT NOT NULL,
      forked_by TEXT NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (original_document_id) REFERENCES documents (id),
      FOREIGN KEY (forked_document_id) REFERENCES documents (id),
      FOREIGN KEY (forked_by) REFERENCES users (id)
    )
  `)

  // Activity log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `)

  // Collection documents junction table (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_documents (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
      UNIQUE(collection_id, document_id)
    )
  `)

  // User P2P Collections registry - maps users to their OrbitDB collection store names
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_p2p_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      peer_id TEXT NOT NULL,
      store_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(peer_id, store_name)
    )
  `)

  // Pinned documents table - for users to pin docs to their collection
  db.exec(`
    CREATE TABLE IF NOT EXISTS pinned_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      original_document_id TEXT NOT NULL,
      source_collection_id TEXT NOT NULL,
      document_title TEXT NOT NULL,
      document_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE,
      FOREIGN KEY (source_collection_id) REFERENCES collections (id) ON DELETE CASCADE,
      UNIQUE(user_id, original_document_id)
    )
  `)

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_id);
    CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
    CREATE INDEX IF NOT EXISTS idx_collections_created_by ON collections(created_by);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_collection_documents_collection ON collection_documents(collection_id);
    CREATE INDEX IF NOT EXISTS idx_collection_documents_document ON collection_documents(document_id);
    CREATE INDEX IF NOT EXISTS idx_pinned_documents_user ON pinned_documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_pinned_documents_collection ON pinned_documents(collection_id);
    CREATE INDEX IF NOT EXISTS idx_pinned_documents_original ON pinned_documents(original_document_id);
  `)

  // Create default users if they don't exist
  try {
    // Create theodore
    const existingTheodore = db.prepare('SELECT id FROM users WHERE username = ?').get('theodore')

    if (!existingTheodore) {
      const theodoreId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
      const passwordHash = bcrypt.hashSync('password123', 10)

      db.prepare(`
        INSERT INTO users (id, email, username, password_hash, is_approved, is_admin)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        theodoreId,
        'theodore@retconblackmountain.com',
        'theodore',
        passwordHash,
        1,  // is_approved
        1   // is_admin
      )

      console.log('Default user "theodore" created successfully')
      console.log('Email: theodore@retconblackmountain.com')
      console.log('Password: password123')
    }

    // Create dummy
    const existingDummy = db.prepare('SELECT id FROM users WHERE username = ?').get('dummy')

    if (!existingDummy) {
      const dummyId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
      const passwordHash = bcrypt.hashSync('password123', 10)

      db.prepare(`
        INSERT INTO users (id, email, username, password_hash, is_approved, is_admin)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        dummyId,
        'dummy@retconblackmountain.com',
        'dummy',
        passwordHash,
        1,  // is_approved
        0   // is_admin
      )

      console.log('Default user "dummy" created successfully')
      console.log('Email: dummy@retconblackmountain.com')
      console.log('Password: password123')
    }
  } catch (error) {
    console.error('Failed to create default users:', error)
  }
}