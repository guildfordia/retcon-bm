/**
 * OrbitDB Service Integration Tests
 * Tests the real OrbitDB service running in Docker
 */

import { setTimeout } from 'timers/promises'

// OrbitDB service is running on port 4001
const ORBITDB_SERVICE_URL = 'http://localhost:4001'

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${ORBITDB_SERVICE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

describe('OrbitDB Service Real Integration', () => {
  beforeAll(async () => {
    // Check if OrbitDB service is running
    try {
      const health = await apiCall('/health')
      console.log(' OrbitDB service health:', health)
    } catch (error) {
      console.error(' OrbitDB service not accessible. Is Docker running?')
      throw error
    }
  })

  test('should get peer info from real OrbitDB service', async () => {
    const peerInfo = await apiCall('/peerinfo')

    expect(peerInfo).toHaveProperty('wsMultiaddrPublic')
    expect(peerInfo.wsMultiaddrPublic).toContain('/p2p/')
    console.log(' Peer info:', peerInfo.wsMultiaddrPublic)
  })

  test('should create and use KeyValue store', async () => {
    const storeName = `test-kv-${Date.now()}`

    // Create store
    const createResult = await apiCall('/kv/open', {
      method: 'POST',
      body: JSON.stringify({ name: storeName })
    })

    expect(createResult).toHaveProperty('address')
    expect(createResult.type).toBe('keyvalue')
    console.log(' Created KV store:', createResult.address)

    // Put data
    await apiCall('/kv/put', {
      method: 'POST',
      body: JSON.stringify({
        name: storeName,
        key: 'test-key',
        value: 'test-value'
      })
    })

    // Get data
    const getValue = await apiCall(`/kv/get?name=${storeName}&key=test-key`)
    expect(getValue.value).toBe('test-value')
    expect(getValue.key).toBe('test-key')
    console.log(' Retrieved value:', getValue)
  })

  test('should handle multiple concurrent operations', async () => {
    const storeName = `concurrent-test-${Date.now()}`

    // Create store
    await apiCall('/kv/open', {
      method: 'POST',
      body: JSON.stringify({ name: storeName })
    })

    // Perform multiple concurrent writes
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(
        apiCall('/kv/put', {
          method: 'POST',
          body: JSON.stringify({
            name: storeName,
            key: `key-${i}`,
            value: `value-${i}`
          })
        })
      )
    }

    await Promise.all(promises)

    // Read all values back
    const readPromises = []
    for (let i = 0; i < 10; i++) {
      readPromises.push(
        apiCall(`/kv/get?name=${storeName}&key=key-${i}`)
      )
    }

    const results = await Promise.all(readPromises)

    // Verify all values are correct
    results.forEach((result, index) => {
      expect(result.value).toBe(`value-${index}`)
      expect(result.key).toBe(`key-${index}`)
    })

    console.log(' All concurrent operations completed successfully')
  })

  test('should handle store persistence', async () => {
    const storeName = `persist-test-${Date.now()}`

    // Create and populate store
    await apiCall('/kv/open', {
      method: 'POST',
      body: JSON.stringify({ name: storeName })
    })

    await apiCall('/kv/put', {
      method: 'POST',
      body: JSON.stringify({
        name: storeName,
        key: 'persistent-key',
        value: 'persistent-value'
      })
    })

    // Wait a bit to ensure data is persisted
    await setTimeout(1000)

    // Try to open the same store again (simulating restart)
    const reopenResult = await apiCall('/kv/open', {
      method: 'POST',
      body: JSON.stringify({ name: storeName })
    })

    expect(reopenResult).toHaveProperty('address')

    // Data should still be there
    const persistedValue = await apiCall(`/kv/get?name=${storeName}&key=persistent-key`)
    expect(persistedValue.value).toBe('persistent-value')
    expect(persistedValue.key).toBe('persistent-key')

    console.log(' Data persistence verified')
  })
})