'use client'
import { useEffect, useState } from 'react'
import Tree from 'react-d3-tree'

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

interface TreeNode {
  name: string
  attributes?: {
    id: string
    version: number
    uploadedBy: string
    documentType: string
    isCurrent: boolean
  }
  children?: TreeNode[]
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
  const [treeData, setTreeData] = useState<TreeNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })

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
        const tree = buildTree(documents, rootId)
        setTreeData(tree)
      } catch (err) {
        console.error('Error fetching fork tree:', err)
        setError(err instanceof Error ? err.message : 'Failed to load fork tree')
      } finally {
        setLoading(false)
      }
    }

    fetchForkTree()
  }, [documentId, collectionId])

  // Set initial translate position to center the tree
  useEffect(() => {
    const updateTranslate = () => {
      const container = document.querySelector('.tree-container')
      if (container) {
        const width = container.clientWidth
        const height = container.clientHeight
        setTranslate({ x: width / 2, y: height / 6 })
      }
    }

    updateTranslate()
    window.addEventListener('resize', updateTranslate)
    return () => window.removeEventListener('resize', updateTranslate)
  }, [])

  const buildTree = (documents: Record<string, P2PDocument>, rootId: string): TreeNode => {
    const buildNode = (docId: string): TreeNode => {
      const doc = documents[docId]
      if (!doc) {
        return {
          name: 'Unknown',
          attributes: {
            id: docId,
            version: 0,
            uploadedBy: '',
            documentType: '',
            isCurrent: false
          }
        }
      }

      const children = doc.childDocumentIds
        ?.map(childId => documents[childId] ? buildNode(childId) : null)
        .filter(Boolean) as TreeNode[] || []

      return {
        name: doc.title,
        attributes: {
          id: doc.id,
          version: doc.version || 1,
          uploadedBy: doc.uploadedBy,
          documentType: doc.documentType,
          isCurrent: doc.id === documentId
        },
        children: children.length > 0 ? children : undefined
      }
    }

    return buildNode(rootId)
  }

  const handleNodeClick = (nodeData: any) => {
    if (onNodeClick && nodeData.attributes?.id) {
      onNodeClick(nodeData.attributes.id)
    }
  }

  // Custom node rendering
  const renderCustomNode = ({ nodeDatum }: any) => {
    const isCurrent = nodeDatum.attributes?.isCurrent
    const version = nodeDatum.attributes?.version || 1
    const uploadedBy = nodeDatum.attributes?.uploadedBy || ''
    const docType = nodeDatum.attributes?.documentType || ''

    return (
      <g>
        {/* Node background */}
        <rect
          width="200"
          height="80"
          x="-100"
          y="-40"
          rx="4"
          fill={isCurrent ? '#dbeafe' : '#ffffff'}
          stroke={isCurrent ? '#3b82f6' : '#d1d5db'}
          strokeWidth={isCurrent ? '2' : '1'}
          style={{ cursor: 'pointer' }}
        />

        {/* Document type icon */}
        <text
          x="-85"
          y="-15"
          fontSize="20"
          fill="#6b7280"
        >
          {docType === 'quote' ? '📝' : docType === 'link' ? '🔗' : '🖼️'}
        </text>

        {/* Title */}
        <text
          x="0"
          y="-10"
          textAnchor="middle"
          fontSize="12"
          fontWeight="normal"
          fill="#111827"
        >
          {nodeDatum.name.length > 25
            ? nodeDatum.name.substring(0, 22) + '...'
            : nodeDatum.name}
        </text>

        {/* Version and owner */}
        <text
          x="0"
          y="10"
          textAnchor="middle"
          fontSize="10"
          fill="#6b7280"
        >
          v{version} • {uploadedBy.slice(0, 8)}...
        </text>

        {/* Current indicator */}
        {isCurrent && (
          <text
            x="0"
            y="28"
            textAnchor="middle"
            fontSize="9"
            fontWeight="bold"
            fill="#3b82f6"
          >
            CURRENT
          </text>
        )}
      </g>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-100 w-full max-w-6xl h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b-2 border-gray-900 dark:border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Fork Tree</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Click nodes to view • Scroll to zoom • Drag to pan
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-3xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        {/* Tree Container */}
        <div className="flex-1 tree-container bg-gray-50 dark:bg-gray-800 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-red-600 dark:text-red-400 text-center">
                <p className="font-bold mb-2">Error</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && treeData && (
            <Tree
              data={treeData}
              translate={translate}
              orientation="vertical"
              pathFunc="step"
              collapsible={true}
              initialDepth={10}
              separation={{ siblings: 1.5, nonSiblings: 2 }}
              nodeSize={{ x: 250, y: 150 }}
              renderCustomNodeElement={renderCustomNode}
              onNodeClick={handleNodeClick}
              zoom={0.8}
              scaleExtent={{ min: 0.1, max: 2 }}
              enableLegacyTransitions={false}
              styles={{
                links: {
                  stroke: '#9ca3af',
                  strokeWidth: 2,
                },
              }}
            />
          )}
        </div>

        {/* Footer with legend */}
        <div className="p-3 border-t-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-6 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 bg-blue-100 rounded"></div>
              <span>Current Document</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border border-gray-300 bg-white rounded"></div>
              <span>Other Versions</span>
            </div>
            <div className="flex items-center gap-2">
              <span>📝 Quote</span>
              <span>🔗 Link</span>
              <span>🖼️ Image</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
