export interface User {
  id: string;
  email: string;
  username: string;
  isApproved: boolean;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: string;
  title: string;
  description?: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  collectionId?: string;
  orbitDbAddress?: string;
  ipfsHash?: string;
  isForked: boolean;
  forkedFrom?: string;
  forkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  shareableLink?: string;
  createdBy: string;
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentFork {
  id: string;
  originalDocumentId: string;
  forkedDocumentId: string;
  forkedBy: string;
  reason?: string;
  createdAt: Date;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: 'upload' | 'fork' | 'create_collection' | 'join_collection';
  entityType: 'document' | 'collection';
  entityId: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}