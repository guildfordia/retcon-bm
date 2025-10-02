'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    setIsAuthenticated(!!token)
  }, [pathname])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userId')
    router.push('/auth')
  }

  if (!isAuthenticated) return null

  const navItems = [
    { href: '/feed', label: 'Global Feed' },
    { href: '/collections', label: 'Collections' },
    { href: '/chat', label: 'Chat' },
    { href: '/profile', label: 'Profile' },
  ]


  return (
    <nav className="bg-white dark:bg-black border-b border-gray-300 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-black dark:text-white">Retcon Black Mountain</h1>
            </div>
            <div className="ml-10 flex items-baseline space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900'
                  }`}
                >
                  {item.label}
                </Link>
              ))}

            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className="text-sm text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-900 px-3 py-2 transition-colors"
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-900 px-3 py-2 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}