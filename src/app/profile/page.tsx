'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const router = useRouter()
  const [userData, setUserData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      const token = localStorage.getItem('token')
      const userId = localStorage.getItem('userId')
      const userEmail = localStorage.getItem('userEmail')

      if (!token || !userId) {
        router.push('/auth')
        return
      }

      // Verify token
      const response = await fetch('/api/auth/verify', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        localStorage.clear()
        router.push('/auth')
        return
      }

      const data = await response.json()

      // Extract username from token data or email
      const username = data.user?.username || data.username || userEmail?.split('@')[0] || 'Unknown'

      setUserData({
        userId,
        userEmail,
        username
      })
    } catch (error) {
      console.error('Error loading user data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Profile</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Your account information and session data
          </p>
        </div>

        {/* User ID */}
        <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">User ID (DID)</h2>
          <div className="bg-gray-100 dark:bg-black p-4 border border-gray-300 dark:border-gray-700">
            <code className="text-sm text-gray-800 dark:text-gray-200 break-all">
              {userData?.userId}
            </code>
          </div>
        </div>

        {/* Username */}
        <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Username</h2>
          <p className="text-lg text-gray-800 dark:text-gray-200 font-medium">{userData?.username}</p>
        </div>

        {/* Email */}
        <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Email</h2>
          <p className="text-gray-800 dark:text-gray-200">{userData?.userEmail || 'Not set'}</p>
        </div>
      </div>
    </div>
  )
}