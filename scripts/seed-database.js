#!/usr/bin/env node

/**
 * Database Seed Script
 * Creates example users, collections, and documents for testing
 * Run with: node scripts/seed-database.js
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

// Database path - matches the Docker volume mount
const dbPath = process.env.DATABASE_URL || 'file:/data/sqlite.db';
const resolvedPath = dbPath.startsWith('file:') ? dbPath.slice(5) : dbPath;

console.log('🌱 Starting database seed...');
console.log(`📂 Database path: ${resolvedPath}`);

const db = new Database(resolvedPath);

// Helper function to generate IDs
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Create users if they don't exist
function seedUsers() {
  console.log('\n👥 Seeding users...');

  const users = [
    {
      id: generateId('user'),
      email: 'dummy@retconblackmountain.com',
      username: 'dummy',
      password: 'password123',
      is_approved: true,
      is_admin: false
    },
    {
      id: generateId('user'),
      email: 'theodore@retconblackmountain.com',
      username: 'theodore',
      password: 'password123',
      is_approved: true,
      is_admin: true
    }
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, username, password_hash, is_approved, is_admin)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const getUserByUsername = db.prepare('SELECT id FROM users WHERE username = ?');

  const userIds = {};

  for (const user of users) {
    // Check if user exists
    const existing = getUserByUsername.get(user.username);
    if (existing) {
      console.log(`  ✓ User '${user.username}' already exists`);
      userIds[user.username] = existing.id;
    } else {
      const passwordHash = bcrypt.hashSync(user.password, 10);
      insertUser.run(
        user.id,
        user.email,
        user.username,
        passwordHash,
        user.is_approved,
        user.is_admin
      );
      console.log(`  ✓ Created user '${user.username}' (${user.email})`);
      userIds[user.username] = user.id;
    }
  }

  return userIds;
}

// Create collections
function seedCollections(userIds) {
  console.log('\n📚 Seeding collections...');

  const collections = [
    {
      id: generateId('col'),
      name: 'My Reading Collection',
      description: 'Personal quotes and references from my favorite books',
      created_by: userIds.dummy
    },
    {
      id: generateId('col'),
      name: 'Research Archive',
      description: 'Technical resources, citations, and research materials',
      created_by: userIds.theodore
    }
  ];

  const insertCollection = db.prepare(`
    INSERT OR IGNORE INTO collections (id, name, description, created_by, document_count)
    VALUES (?, ?, ?, ?, 0)
  `);

  const getCollectionByName = db.prepare('SELECT id FROM collections WHERE name = ? AND created_by = ?');

  const collectionIds = {};

  for (const collection of collections) {
    const existing = getCollectionByName.get(collection.name, collection.created_by);
    if (existing) {
      console.log(`  ✓ Collection '${collection.name}' already exists`);
      collectionIds[collection.created_by] = existing.id;
    } else {
      insertCollection.run(
        collection.id,
        collection.name,
        collection.description,
        collection.created_by
      );
      console.log(`  ✓ Created collection '${collection.name}'`);
      collectionIds[collection.created_by] = collection.id;
    }
  }

  return collectionIds;
}

// Create documents
function seedDocuments(userIds, collectionIds) {
  console.log('\n📄 Seeding documents...');

  const documents = [
    // Dummy's documents
    {
      id: generateId('doc'),
      title: 'Stanford Commencement Address',
      description: 'Inspirational quote about work and passion',
      document_type: 'quote',
      uploaded_by: userIds.dummy,
      collection_id: collectionIds[userIds.dummy],
      metadata: JSON.stringify({
        quoteContent: 'The only way to do great work is to love what you do.',
        author: 'Steve Jobs',
        title: 'Stanford Commencement Address',
        year: '2005',
        publisher: 'Stanford University',
        keywords: ['motivation', 'career', 'passion', 'work'],
        pageNumbers: 'Speech transcript'
      })
    },
    {
      id: generateId('doc'),
      title: 'Peer-to-peer - Wikipedia',
      description: 'Comprehensive overview of P2P networking architecture',
      document_type: 'link',
      uploaded_by: userIds.dummy,
      collection_id: collectionIds[userIds.dummy],
      metadata: JSON.stringify({
        url: 'https://en.wikipedia.org/wiki/Peer-to-peer',
        title: 'Peer-to-peer',
        description: 'Overview of P2P distributed architecture and networking',
        author: 'Wikipedia Contributors',
        siteName: 'Wikipedia',
        keywords: ['p2p', 'networking', 'distributed', 'architecture']
      })
    },
    {
      id: generateId('doc'),
      title: 'Abstract Network Visualization',
      description: 'Visual representation of distributed network topology',
      document_type: 'image',
      filename: 'network-viz.jpg',
      original_filename: 'network-visualization.jpg',
      mime_type: 'image/jpeg',
      size: 524288, // 512KB
      uploaded_by: userIds.dummy,
      collection_id: collectionIds[userIds.dummy],
      ipfs_hash: `QmMockHash${Date.now().toString(36)}DummyImage`,
      metadata: JSON.stringify({
        title: 'Network Topology Diagram',
        description: 'Distributed P2P network visualization',
        creator: 'dummy',
        keywords: ['network', 'visualization', 'topology', 'p2p']
      })
    },
    // Theodore's documents
    {
      id: generateId('doc'),
      title: 'Designing Data-Intensive Applications',
      description: 'Key insights on distributed systems architecture',
      document_type: 'quote',
      uploaded_by: userIds.theodore,
      collection_id: collectionIds[userIds.theodore],
      metadata: JSON.stringify({
        quoteContent: 'The biggest challenge in distributed systems is dealing with partial failures.',
        author: 'Martin Kleppmann',
        title: 'Designing Data-Intensive Applications',
        publisher: "O'Reilly Media",
        year: '2017',
        isbn: '978-1449373320',
        keywords: ['distributed systems', 'databases', 'architecture', 'reliability'],
        pageNumbers: '174-186'
      })
    },
    {
      id: generateId('doc'),
      title: 'IPFS Documentation',
      description: 'Official InterPlanetary File System documentation',
      document_type: 'link',
      uploaded_by: userIds.theodore,
      collection_id: collectionIds[userIds.theodore],
      metadata: JSON.stringify({
        url: 'https://docs.ipfs.tech/',
        title: 'IPFS Docs',
        description: 'A peer-to-peer hypermedia protocol designed to preserve and grow humanity\'s knowledge',
        author: 'Protocol Labs',
        siteName: 'IPFS Documentation',
        keywords: ['ipfs', 'p2p', 'storage', 'protocol', 'documentation']
      })
    },
    {
      id: generateId('doc'),
      title: 'System Architecture Diagram',
      description: 'Technical architecture of distributed storage system',
      document_type: 'image',
      filename: 'architecture-diagram.png',
      original_filename: 'system-architecture.png',
      mime_type: 'image/png',
      size: 819200, // 800KB
      uploaded_by: userIds.theodore,
      collection_id: collectionIds[userIds.theodore],
      ipfs_hash: `QmMockHash${Date.now().toString(36)}TheodoreImage`,
      metadata: JSON.stringify({
        title: 'Distributed Storage Architecture',
        description: 'System design showing IPFS and OrbitDB integration',
        creator: 'theodore',
        source: 'Internal research',
        date: new Date().toISOString().split('T')[0],
        keywords: ['architecture', 'system design', 'ipfs', 'orbitdb', 'distributed']
      })
    }
  ];

  const insertDocument = db.prepare(`
    INSERT OR IGNORE INTO documents (
      id, title, description, document_type, filename, original_filename,
      mime_type, size, uploaded_by, collection_id, ipfs_hash, metadata,
      is_forked, fork_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `);

  const insertCollectionDocument = db.prepare(`
    INSERT OR IGNORE INTO collection_documents (id, collection_id, document_id)
    VALUES (?, ?, ?)
  `);

  const updateCollectionCount = db.prepare(`
    UPDATE collections
    SET document_count = document_count + 1
    WHERE id = ?
  `);

  for (const doc of documents) {
    insertDocument.run(
      doc.id,
      doc.title,
      doc.description,
      doc.document_type,
      doc.filename || null,
      doc.original_filename || null,
      doc.mime_type || null,
      doc.size || null,
      doc.uploaded_by,
      doc.collection_id,
      doc.ipfs_hash || null,
      doc.metadata
    );

    // Link document to collection
    insertCollectionDocument.run(
      generateId('cd'),
      doc.collection_id,
      doc.id
    );

    // Update collection document count
    updateCollectionCount.run(doc.collection_id);

    const docTypeEmoji = doc.document_type === 'quote' ? '📝' :
                        doc.document_type === 'link' ? '🔗' : '🖼️';
    console.log(`  ${docTypeEmoji} Created ${doc.document_type}: '${doc.title}'`);
  }

  return documents.length;
}

// Create activity logs
function seedActivityLogs(userIds, documents) {
  console.log('\n📊 Seeding activity logs...');

  const insertActivity = db.prepare(`
    INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let activityCount = 0;

  // Log document uploads
  for (const doc of documents) {
    insertActivity.run(
      generateId('activity'),
      doc.uploaded_by,
      'upload',
      'document',
      doc.id,
      JSON.stringify({ document_type: doc.document_type, title: doc.title })
    );
    activityCount++;
  }

  console.log(`  ✓ Created ${activityCount} activity logs`);
}

// Main seeding function
function seedDatabase() {
  try {
    console.log('🔄 Starting transaction...\n');

    // Use transaction for atomicity
    const seed = db.transaction(() => {
      const userIds = seedUsers();
      const collectionIds = seedCollections(userIds);
      const documents = seedDocuments(userIds, collectionIds);
      seedActivityLogs(userIds, []);

      return { userIds, collectionIds, documentCount: documents };
    });

    const result = seed();

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📋 Summary:');
    console.log(`  - Users: dummy, theodore`);
    console.log(`  - Collections: 2 (1 per user)`);
    console.log(`  - Documents: ${result.documentCount} (3 per collection)`);
    console.log(`    • Quotes: 2`);
    console.log(`    • Links: 2`);
    console.log(`    • Images: 2`);
    console.log('\n🔑 Login credentials:');
    console.log('  - dummy@retconblackmountain.com / password123');
    console.log('  - theodore@retconblackmountain.com / password123');
    console.log('\n🌐 Access at: https://localhost:8443\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run the seed
seedDatabase();
