import { NextRequest, NextResponse } from 'next/server'
import { importPKCS8, importSPKI, SignJWT } from 'jose'
import { createHash } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { privateKey, challenge, username } = await request.json()

    if (!privateKey) {
      return NextResponse.json(
        { error: 'Private key is required for P2P authentication' },
        { status: 400 }
      )
    }

    // Import private key
    const privateKeyBuffer = Buffer.from(privateKey, 'base64')
    const cryptoPrivateKey = await importPKCS8(privateKeyBuffer.toString(), 'Ed25519')

    // Derive public key from private key
    const publicKeySpki = await importSPKI(privateKeyBuffer.toString(), 'Ed25519')
      .then(async (key) => {
        // For now, we'll reconstruct the public key identifier
        // In production, this would be more sophisticated
        const keyData = Buffer.from(privateKey, 'base64')
        return createHash('sha256').update(keyData).digest('hex').substring(0, 32)
      })
      .catch(() => {
        // Fallback: generate DID from private key hash
        return createHash('sha256').update(Buffer.from(privateKey, 'base64')).digest('hex').substring(0, 32)
      })

    const did = `did:p2p:${publicKeySpki}`

    // Create P2P session token (using private key to sign)
    const sessionToken = await new SignJWT({
      did,
      type: 'p2p',
      username: username || 'theodore',
      challenge: challenge || Date.now().toString()
    })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(cryptoPrivateKey)

    const response = NextResponse.json({
      message: 'P2P authentication successful',
      identity: {
        did,
        type: 'p2p',
        authenticated: true,
        lastSeen: Date.now()
      }
    })

    // Set JWT token as httpOnly cookie for security
    response.cookies.set('auth_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    })

    // Also set user info in separate cookie for client-side access
    response.cookies.set('user_info', JSON.stringify({
      did,
      username: username || 'theodore'
    }), {
      httpOnly: false, // Allow client-side access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/'
    })

    return response

  } catch (error) {
    console.error('P2P login error:', error)
    return NextResponse.json(
      { error: 'P2P authentication failed' },
      { status: 401 }
    )
  }
}