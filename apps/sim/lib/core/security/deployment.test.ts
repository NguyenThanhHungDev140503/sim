/**
 * @vitest-environment node
 */

import { sha256Hex } from '@sim/security/hash'
import { hmacSha256Hex } from '@sim/security/hmac'
import type { NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { env } from '@/lib/core/config/env'
import {
  isEmailAllowed,
  readDeploymentAuthToken,
  setDeploymentAuthCookie,
} from '@/lib/core/security/deployment'

function mintDeploymentAuthToken(
  deploymentId: string,
  authType: string,
  authenticatedEmail?: string
): string {
  const set = vi.fn()
  const response = { cookies: { set } } as unknown as NextResponse
  setDeploymentAuthCookie(response, 'chat', deploymentId, authType, undefined, authenticatedEmail)
  return set.mock.calls[0][0].value
}

function mintLegacyDeploymentAuthToken(
  deploymentId: string,
  authType: string,
  encryptedPassword?: string
): string {
  const passwordSlot = encryptedPassword ? sha256Hex(encryptedPassword).slice(0, 8) : ''
  const payload = `${deploymentId}:${authType}:${Date.now()}:${passwordSlot}`
  const signature = hmacSha256Hex(payload, env.BETTER_AUTH_SECRET)
  return Buffer.from(`${payload}:${signature}`).toString('base64')
}

describe('deployment auth tokens', () => {
  it('round-trips the normalized email proven by OTP authentication', () => {
    const token = mintDeploymentAuthToken('chat-1', 'email', ' Person@Example.com ')

    expect(readDeploymentAuthToken(token, 'chat-1', 'email')).toEqual({
      authenticatedEmail: 'person@example.com',
    })
  })

  it('does not attach identity to actorless password authentication', () => {
    const token = mintDeploymentAuthToken('chat-1', 'password')

    expect(readDeploymentAuthToken(token, 'chat-1', 'password')).toEqual({})
  })

  it('accepts a valid legacy password token without inventing identity', () => {
    const token = mintLegacyDeploymentAuthToken('chat-1', 'password', 'encrypted-password')

    expect(readDeploymentAuthToken(token, 'chat-1', 'password', 'encrypted-password')).toEqual({})
  })

  it('rejects a legacy email token that cannot prove an email identity', () => {
    const token = mintLegacyDeploymentAuthToken('chat-1', 'email')

    expect(readDeploymentAuthToken(token, 'chat-1', 'email')).toBeNull()
  })

  it('rejects a token outside its bound deployment and authentication type', () => {
    const token = mintDeploymentAuthToken('chat-1', 'email', 'person@example.com')

    expect(readDeploymentAuthToken(token, 'chat-2', 'email')).toBeNull()
    expect(readDeploymentAuthToken(token, 'chat-1', 'password')).toBeNull()
  })

  it('fails fast when an email-auth cookie omits its proven email', () => {
    const response = { cookies: { set: vi.fn() } } as unknown as NextResponse

    expect(() => setDeploymentAuthCookie(response, 'chat', 'chat-1', 'email')).toThrow(
      'Email-auth deployment cookies require an authenticated email'
    )
  })

  it('fails fast when an actorless auth mode is given an email', () => {
    const response = { cookies: { set: vi.fn() } } as unknown as NextResponse

    expect(() =>
      setDeploymentAuthCookie(
        response,
        'chat',
        'chat-1',
        'password',
        undefined,
        'person@example.com'
      )
    ).toThrow('Deployment auth type password cannot carry an authenticated email')
  })
})

describe('isEmailAllowed', () => {
  it('matches an exact email regardless of casing on either side', () => {
    expect(isEmailAllowed('user@acme.com', ['user@acme.com'])).toBe(true)
    expect(isEmailAllowed('User@Acme.com', ['user@acme.com'])).toBe(true)
    expect(isEmailAllowed('user@acme.com', ['USER@ACME.COM'])).toBe(true)
    expect(isEmailAllowed('  User@Acme.com  ', ['user@acme.com'])).toBe(true)
  })

  it('matches a domain pattern regardless of casing (covers IdP/session emails)', () => {
    expect(isEmailAllowed('User@Acme.com', ['@acme.com'])).toBe(true)
    expect(isEmailAllowed('user@acme.com', ['@Acme.com'])).toBe(true)
  })

  it('rejects emails not on the allow-list', () => {
    expect(isEmailAllowed('user@evil.com', ['user@acme.com', '@acme.com'])).toBe(false)
    expect(isEmailAllowed('user@acme.com', [])).toBe(false)
  })
})
