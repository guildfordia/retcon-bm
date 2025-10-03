'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface P2PDocument {
  id: string
  documentType: 'quote' | 'link' | 'image'
  title: string
  version?: number
  uploadedBy: string
  created: number
  parentDocumentId?: string
  childDocumentIds?: string[]
}

interface ForkTreeViewProps {
  documentId: string
  collectionId: string
  onClose: () => void
  onNodeClick?: (documentId: string) => void
}

export default function ForkTreeView({
  documentId,
  collectionId,
  onClose,
  onNodeClick
}: ForkTreeViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch fork tree data
  useEffect(() => {
    const fetchForkTree = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch the document and its fork relationships
        const response = await fetch(`/api/documents/p2p/fork-tree?documentId=${documentId}&collectionId=${collectionId}`)

        if (!response.ok) {
          throw new Error('Failed to fetch fork tree')
        }

        const data = await response.json()
        const { documents, rootId } = data

        // Build the tree structure
        const { nodes: treeNodes, edges: treeEdges } = buildTree(documents, rootId)

        setNodes(treeNodes)
        setEdges(treeEdges)
      } catch (err) {
        console.error('Error fetching fork tree:', err)
        setError(err instanceof Error ? err.message : 'Failed to load fork tree')
      } finally {
        setLoading(false)
      }
    }

    fetchForkTree()
  }, [documentId, collectionId])

  const buildTree = (documents: Record<string, P2PDocument>, rootId: string) => {
    const nodes: Node[] = []
    const edges: Edge[] = []
    const levelMap = new Map<string, number>()
    const positionMap = new Map<number, number>()

    // Calculate levels (depth in tree)
    const calculateLevel = (docId: string, level: number = 0) => {
      levelMap.set(docId, level)
      const doc = documents[docId]
      if (doc?.childDocumentIds) {
        doc.childDocumentIds.forEach(childId => {
          if (documents[childId]) {
            calculateLevel(childId, level + 1)
          }
        })
      }
    }

    calculateLevel(rootId)

    // Build nodes and edges
    const processDocument = (docId: string) => {
      const doc = documents[docId]
      if (!doc) return

      const level = levelMap.get(docId) || 0
      const xPosition = (positionMap.get(level) || 0) * 300
      positionMap.set(level, (positionMap.get(level) || 0) + 1)

      const yPosition = level * 150

      const isCurrentDoc = docId === documentId

      nodes.push({
        id: docId,
        type: 'default',
        position: { x: xPosition, y: yPosition },
        data: {
          label: (
            <div className={`p-2 ${isCurrentDoc ? 'bg-blue-50 dark:bg-blue-900' : ''}`}>
              <div className="font-semibold text-sm truncate" style={{ maxWidth: '200px' }}>
                {doc.title}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                v{doc.version || 1} • {doc.uploadedBy.slice(0, 8)}
              </div>
            </div>
          )
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: {
          background: isCurrentDoc ? '#dbeafe' : '#fff',
          border: isCurrentDoc ? '2px solid #3b82f6' : '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer'
        }
      })

      // Create edges to children
      if (doc.childDocumentIds) {
        doc.childDocumentIds.forEach(childId => {
          if (documents[childId]) {
            edges.push({
              id: `${docId}-${childId}`,
              source: docId,
              target: childId,
              type: 'smoothstep',
              animated: false
            })
            processDocument(childId)
          }
        })
      }
    }

    processDocument(rootId)

    return { nodes, edges }
  }

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (onNodeClick) {
      onNodeClick(node.id)
    }
  }, [onNodeClick])

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-900 dark:border-gray-100 w-full max-w-6xl h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Fork Tree</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="h-[calc(100%-4rem)]">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-600 dark:text-red-400">{error}</div>
            </div>
          )}

          {!loading && !error && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              fitView
              className="dark:bg-gray-800"
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          )}
        </div>
      </div>
    </div>
  )
}
