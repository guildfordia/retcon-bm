# API Testing Guide

## Base URL
When running locally: `http://localhost:3000/api`

## Testing Tools

**Recommended:**
- **Postman** - Full-featured GUI
- **Thunder Client** - VSCode extension
- **curl** - Command line
- **Insomnia** - Alternative GUI

## API Endpoints

### 🔐 Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "testuser",
  "password": "securepassword123"
}
```

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

### 👥 Users Management

#### Get All Users
```http
GET /api/users
```

#### Update User (Admin approval)
```http
PATCH /api/users
Content-Type: application/json

{
  "userId": "user-uuid-here",
  "isApproved": true,
  "isAdmin": false
}
```

### 📁 Collections

#### Get Collections
```http
GET /api/collections
GET /api/collections?public=true
GET /api/collections?userId=user-uuid-here
```

#### Create Collection
```http
POST /api/collections
Content-Type: application/json

{
  "name": "My Research Collection",
  "description": "Collection for research documents",
  "isPublic": true,
  "createdBy": "user-uuid-here"
}
```

### 📄 Documents

#### Get Documents
```http
GET /api/documents
GET /api/documents?collectionId=collection-uuid
GET /api/documents?userId=user-uuid
GET /api/documents?type=application/pdf
```

#### Upload Document
```http
POST /api/documents
Content-Type: multipart/form-data

Form data:
- title: "My Document"
- description: "Document description"
- uploadedBy: "user-uuid-here"
- collectionId: "collection-uuid" (optional)
- file: [select file]
```

#### Fork Document
```http
POST /api/documents/fork
Content-Type: application/json

{
  "originalDocumentId": "document-uuid-here",
  "forkedBy": "user-uuid-here",
  "reason": "Adding my annotations"
}
```

### 📊 Activity Feed

#### Get Activity
```http
GET /api/activity
GET /api/activity?userId=user-uuid-here
GET /api/activity?entityType=document
GET /api/activity?limit=20
```

## Postman Testing Workflow

### 1. Setup Environment
Create a Postman environment with:
- `baseUrl`: `http://localhost:3000/api`
- `userId`: (will be set after registration)

### 2. Test Sequence

1. **Register a user**
   - POST to `{{baseUrl}}/auth/register`
   - Save the `userId` from response

2. **Approve the user** (simulate admin action)
   - PATCH to `{{baseUrl}}/users`
   - Set `isApproved: true` for the user

3. **Login**
   - POST to `{{baseUrl}}/auth/login`
   - Verify successful login

4. **Create a collection**
   - POST to `{{baseUrl}}/collections`
   - Save the `collectionId`

5. **Upload a document**
   - POST to `{{baseUrl}}/documents`
   - Use form-data, attach a test file
   - Save the `documentId`

6. **Fork the document**
   - POST to `{{baseUrl}}/documents/fork`

7. **Check activity**
   - GET to `{{baseUrl}}/activity`

## curl Examples

### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "password123"
  }'
```

### Create Collection
```bash
curl -X POST http://localhost:3000/api/collections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Collection",
    "description": "Testing collection creation",
    "isPublic": true,
    "createdBy": "USER_UUID_HERE"
  }'
```

### Upload Document
```bash
curl -X POST http://localhost:3000/api/documents \
  -F "title=Test Document" \
  -F "description=Test file upload" \
  -F "uploadedBy=USER_UUID_HERE" \
  -F "file=@/path/to/your/file.pdf"
```

## Expected Responses

### Success Responses
- **201 Created**: Resource created successfully
- **200 OK**: Request successful with data

### Error Responses
- **400 Bad Request**: Missing required fields
- **401 Unauthorized**: Invalid credentials
- **403 Forbidden**: User not approved or insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource already exists
- **500 Internal Server Error**: Server error

## Testing Notes

1. **User Flow**: Users must be approved by admin before they can login
2. **File Uploads**: Use `multipart/form-data` for document uploads
3. **UUIDs**: All IDs are UUID v4 format
4. **Database**: SQLite database (`rbm.db`) is created automatically
5. **Fork System**: Forked documents maintain relationship to original

## Database Inspection

To inspect the SQLite database directly:
```bash
sqlite3 rbm.db
.tables
SELECT * FROM users;
SELECT * FROM collections;
SELECT * FROM documents;
```