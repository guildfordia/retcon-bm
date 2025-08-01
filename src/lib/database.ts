import Database from 'better-sqlite3'
import { User, Document, Collection, DocumentFork, ActivityLog } from '@/types'

let db: Database.Database | null = null

export function getDatabase() {
  if (!db) {
    db = new Database('rbm.db')
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

  // Collections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_public BOOLEAN DEFAULT FALSE,
      shareable_link TEXT UNIQUE,
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
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL,
      collection_id TEXT,
      orbit_db_address TEXT,
      ipfs_hash TEXT,
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

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_id);
    CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
    CREATE INDEX IF NOT EXISTS idx_collections_created_by ON collections(created_by);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
  `)
}