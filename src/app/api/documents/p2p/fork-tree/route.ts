import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'

// Get Fork Tree - Retrieve all documents in a fork lineage
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')
    const collectionId = searchParams.get('collectionId')

    if (!documentId || !collectionId) {
      return NextResponse.json(
        { error: 'Document ID and collection ID are required' },
        { status: 400 }
      )
    }

    // Check OrbitDB health
    const health = await orbitdbClient.health()
    if (!health.ok) {
      throw new Error('OrbitDB service is not available')
    }

    // Get all documents from the collection
    const collectionStoreName = collectionId
    const documents = await orbitdbClient.getCollectionDocuments(collectionStoreName)

    // Find the requested document
    const targetDocument = documents.find(doc => doc.id === documentId)

    if (!targetDocument) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Build a map of all documents by ID
    const documentMap: Record<string, any> = {}
    documents.forEach(doc => {
      documentMap[doc.id] = doc
    })

    // Find the root of the tree (walk up parent chain)
    let rootId = documentId
    let currentId = documentId
    const visited = new Set<string>()

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const doc = documentMap[currentId]
      if (doc?.parentDocumentId && documentMap[doc.parentDocumentId]) {
        rootId = doc.parentDocumentId
        currentId = doc.parentDocumentId
      } else {
        break
      }
    }

    // Collect all documents in the tree (root + all descendants)
    const treeDocuments: Record<string, any> = {}
    const collectDescendants = (docId: string) => {
      if (!documentMap[docId] || treeDocuments[docId]) return

      treeDocuments[docId] = documentMap[docId]

      const doc = documentMap[docId]
      if (doc?.childDocumentIds) {
        doc.childDocumentIds.forEach((childId: string) => {
          if (documentMap[childId]) {
            collectDescendants(childId)
          }
        })
      }
    }

    collectDescendants(rootId)

    return NextResponse.json({
      documents: treeDocuments,
      rootId,
      requestedDocumentId: documentId
    }, { status: 200 })

  } catch (error) {
    console.error('Fork tree fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch fork tree', details: error.message },
      { status: 500 }
    )
  }
}
