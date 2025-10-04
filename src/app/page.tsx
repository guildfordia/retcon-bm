'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      // Check for user info (indicates logged in session)
      const userId = localStorage.getItem('userId');

      if (!userId) {
        router.push('/auth');
        setIsChecking(false);
        return;
      }

      try {
        // Verify auth cookie is still valid
        const response = await fetch('/api/auth/verify', {
          credentials: 'include' // Send cookies with request
        });

        if (response.ok) {
          router.push('/feed');
        } else {
          // Clear all auth data
          localStorage.removeItem('userId');
          localStorage.removeItem('username');
          localStorage.removeItem('authMode');
          localStorage.removeItem('p2pPrivateKey');
          localStorage.removeItem('p2pPublicKey');
          router.push('/auth');
        }
      } catch (error) {
        router.push('/auth');
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  // Show loading state while checking auth to prevent flash
  if (isChecking) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
      </div>
    );
  }

  return null;
}
