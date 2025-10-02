import { NextRequest, NextResponse } from 'next/server'
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose'
import { createHash } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { username, displayName } = await request.json()

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    // Generate Ed25519 key pair for P2P identity
    const { privateKey, publicKey } = await generateKeyPair('Ed25519')

    // Export keys
    const privateKeyPkcs8 = await exportPKCS8(privateKey)
    const publicKeySpki = await exportSPKI(publicKey)

    // Generate deterministic DID from public key
    const publicKeyBytes = Buffer.from(publicKeySpki)
    const did = 'did:p2p:' + createHash('sha256').update(publicKeyBytes).digest('hex').substring(0, 32)

    // Create P2P user profile
    const profile = {
      did,
      username,
      displayName: displayName || username,
      publicKey: Buffer.from(publicKeySpki).toString('base64'),
      created: Date.now(),
      lastSeen: Date.now()
    }

    return NextResponse.json({
      message: 'P2P identity created successfully',
      identity: profile,
      privateKey: Buffer.from(privateKeyPkcs8).toString('base64'), // User must backup this!
      warning: 'IMPORTANT: Save your private key securely. It cannot be recovered.'
    }, { status: 201 })

  } catch (error) {
    console.error('P2P registration error:', error)
    return NextResponse.json(
      { error: 'Failed to create P2P identity' },
      { status: 500 }
    )
  }
}