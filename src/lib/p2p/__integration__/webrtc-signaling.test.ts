/**
 * WebRTC Signaling Real Integration Tests
 * Tests the actual WebRTC signaling server
 */

import WebSocket from 'ws'
import { setTimeout } from 'timers/promises'

const SIGNALING_SERVER_URL = 'ws://localhost:9090'

// Check if signaling server is running
async function checkSignalingServer(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:9090/health')
    const health = await response.json()
    return health.ok === true
  } catch {
    return false
  }
}

describe('WebRTC Signaling Real Integration', () => {
  let isServerRunning = false

  beforeAll(async () => {
    isServerRunning = await checkSignalingServer()
    if (!isServerRunning) {
      console.log('  WebRTC Signaling server not running on port 9090')
      console.log('   You can start it with: cd signaling-server && node server.js')
    }
  })

  test('should connect to signaling server health endpoint', async () => {
    if (!isServerRunning) {
      console.log('  Skipping test - signaling server not running')
      return
    }

    const response = await fetch('http://localhost:9090/health')
    const health = await response.json()

    expect(health).toHaveProperty('ok')
    expect(health).toHaveProperty('peers')
    expect(health).toHaveProperty('rooms')
    expect(health.ok).toBe(true)

    console.log(' Signaling server health:', health)
  })

  test('should establish WebSocket connection', async () => {
    if (!isServerRunning) {
      console.log('  Skipping test - signaling server not running')
      return
    }

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(SIGNALING_SERVER_URL)
      let connected = false

      const timeout = setTimeout(() => {
        if (!connected) {
          ws.close()
          reject(new Error('Connection timeout'))
        }
      }, 5000)

      ws.on('open', () => {
        connected = true
        clearTimeout(timeout)
        console.log(' WebSocket connected to signaling server')
        ws.close()
        resolve()
      })

      ws.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())
        console.log(' Received message:', message)
      })
    })
  })

  test('should handle authentication challenge', async () => {
    if (!isServerRunning) {
      console.log('  Skipping test - signaling server not running')
      return
    }

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(SIGNALING_SERVER_URL)
      let receivedChallenge = false

      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('No authentication challenge received'))
      }, 5000)

      ws.on('open', () => {
        console.log(' Connected, waiting for auth challenge...')
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (message.type === 'auth_required') {
          receivedChallenge = true
          clearTimeout(timeout)
          console.log(' Received authentication challenge')
          ws.close()
          resolve()
        }
      })

      ws.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  })

  test('should maintain multiple concurrent connections', async () => {
    if (!isServerRunning) {
      console.log('  Skipping test - signaling server not running')
      return
    }

    const connections: WebSocket[] = []
    const connectionPromises: Promise<void>[] = []

    // Create 5 concurrent connections
    for (let i = 0; i < 5; i++) {
      const promise = new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(SIGNALING_SERVER_URL)
        connections.push(ws)

        const timeout = setTimeout(() => {
          reject(new Error(`Connection ${i} timeout`))
        }, 5000)

        ws.on('open', () => {
          clearTimeout(timeout)
          console.log(` Connection ${i} established`)
          resolve()
        })

        ws.on('error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      connectionPromises.push(promise)
    }

    // Wait for all connections
    await Promise.all(connectionPromises)

    // Check server health to see connection count
    const health = await (await fetch('http://localhost:9090/health')).json()
    expect(health.peers).toBeGreaterThanOrEqual(5)

    // Close all connections
    connections.forEach(ws => ws.close())

    // Wait a bit for cleanup
    await setTimeout(1000)

    console.log(' All concurrent connections handled successfully')
  })
})