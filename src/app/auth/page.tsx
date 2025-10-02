'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function P2PAuth() {
  const [mounted, setMounted] = useState(false)
  const [username, setUsername] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success'>('success')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const router = useRouter()

  const THEODORE_PRIVATE_KEY = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSUVic1l3K3dZSFdabzlqWjFvaGRiL1JwYnVEcHdMdjNnNGZKUjl3YmxmZHMKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo='
  const DUMMY_PRIVATE_KEY = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSU9qRmxmV0tQcVFvNHhCVFphOGlwVmFmd0JKQWl3cFpEbjRvOCtENi9VMzgKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo='

  useEffect(() => {
    // Check if already authenticated
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/feed');
      return;
    }

    // Force client-side rendering with a small delay
    const timer = setTimeout(() => setMounted(true), 10)
    return () => clearTimeout(timer)
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
      </div>
    )
  }

  const showMessage = (text: string, isError = false) => {
    setMessage(text)
    setMessageType(isError ? 'error' : 'success')
  }

  const p2pAuth = async (endpoint: string, data: any) => {
    try {
      setIsLoading(true)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        if (endpoint.includes('login')) {
          localStorage.setItem('token', result.token)
          localStorage.setItem('userId', result.identity.did)
          localStorage.setItem('username', data.username || 'theodore')
          localStorage.setItem('authMode', 'p2p')
          localStorage.setItem('p2pPrivateKey', data.privateKey)
          localStorage.setItem('p2pPublicKey', result.identity.did)

          showMessage('P2P login successful! Redirecting...')
          setTimeout(() => router.push('/feed'), 1000)
        } else {
          showMessage(`P2P identity created! DID: ${result.identity.did.slice(0, 20)}...`)
          setUsername('')
          setPrivateKey('')
        }
      } else {
        showMessage(result.error || 'Authentication failed', true)
      }
    } catch (error: any) {
      showMessage('Network error: ' + error.message, true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTheodore = () => {
    setUsername('theodore')
    setPrivateKey(THEODORE_PRIVATE_KEY)
    p2pAuth('/api/auth/p2p/login', {
      username: 'theodore',
      privateKey: THEODORE_PRIVATE_KEY
    })
  }

  const handleDummy = () => {
    setUsername('dummy')
    setPrivateKey(DUMMY_PRIVATE_KEY)
    p2pAuth('/api/auth/p2p/login', {
      username: 'dummy',
      privateKey: DUMMY_PRIVATE_KEY
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (mode === 'login' && (!username || !privateKey)) {
      showMessage('Please enter username and private key', true)
      return
    }

    if (mode === 'register' && !username) {
      showMessage('Please enter a username', true)
      return
    }

    const endpoint = mode === 'login' ? '/api/auth/p2p/login' : '/api/auth/p2p/register'
    p2pAuth(endpoint, { username, privateKey })
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            P2P Authentication
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Decentralized identity system
          </p>
        </div>

        {/* Quick Test Logins */}
        <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Quick Test Logins</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Login as Theodore
                </p>
              </div>
              <button
                onClick={handleTheodore}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black text-sm hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50"
              >
                Theodore
              </button>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Login as Dummy (test account)
                </p>
              </div>
              <button
                onClick={handleDummy}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-700 dark:bg-gray-300 text-white dark:text-black text-sm hover:bg-gray-600 dark:hover:bg-gray-400 disabled:opacity-50"
              >
                Dummy
              </button>
            </div>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-center">
          <div className="flex bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-1">
            <button
              onClick={() => setMode('login')}
              className={`px-4 py-2 text-sm ${
                mode === 'login'
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-black'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode('register')}
              className={`px-4 py-2 text-sm ${
                mode === 'register'
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-black'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              Register
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="Enter username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Private Key {mode === 'register' && '(optional)'}
            </label>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder={mode === 'login' ? 'Your P2P private key' : 'Leave empty to auto-generate'}
            />
          </div>

          {/* Message */}
          {message && (
            <div className={`p-3 border ${
              messageType === 'error'
                ? 'bg-white dark:bg-gray-900 border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100'
            }`}>
              <p className="text-sm">{message}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-gray-300 text-white dark:text-black disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : mode === 'login' ? 'P2P Login' : 'Create P2P Identity'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            P2P authentication - No approval needed
          </p>
        </div>
      </div>
    </div>
  )
}