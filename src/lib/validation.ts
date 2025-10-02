/**
 * Validation schemas using Zod
 * Centralized validation for API inputs
 */

import { z } from 'zod'

// Auth validation schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
})

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters')
})

// P2P auth validation
export const p2pLoginSchema = z.object({
  privateKey: z.string().min(1, 'Private key is required'),
  challenge: z.string().optional(),
  username: z.string().optional()
})

// Collection validation schemas
export const createCollectionSchema = z.object({
  name: z.string().min(1, 'Collection name is required').max(100),
  description: z.string().max(500).optional()
})

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional()
})

// Document validation schemas
export const createDocumentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(1000).optional(),
  collectionId: z.string().optional(),
  tags: z.array(z.string()).optional()
})

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  collectionId: z.string().optional()
})

// OrbitDB validation schemas
export const orbitdbOpenSchema = z.object({
  name: z.string().min(1, 'Store name is required').max(100)
})

export const orbitdbPutSchema = z.object({
  name: z.string().min(1, 'Store name is required'),
  key: z.string().min(1, 'Key is required'),
  value: z.any()
})

export const orbitdbGetSchema = z.object({
  name: z.string().min(1, 'Store name is required'),
  key: z.string().min(1, 'Key is required')
})

export const orbitdbGrantSchema = z.object({
  name: z.string().min(1, 'Store name is required'),
  peerId: z.string().min(1, 'Peer ID is required')
})

// Helper function to validate request body
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return { success: false, error: errorMessages }
    }
    return { success: false, error: 'Validation failed' }
  }
}