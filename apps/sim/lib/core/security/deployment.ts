import { safeCompare } from '@sim/security/compare'
import { sha256Hex } from '@sim/security/hash'
import { hmacSha256Hex } from '@sim/security/hmac'
import { normalizeEmail } from '@sim/utils/string'
import type { NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { isDev } from '@/lib/core/config/env-flags'

/**
 * Shared authentication utilities for deployed chat endpoints.
 * Handles token generation, validation, and auth cookies. CORS for these
 * endpoints lives in proxy.ts as the single source of truth.
 */

function signPayload(payload: string): string {
  return hmacSha256Hex(payload, env.BETTER_AUTH_SECRET)
}

function passwordSlot(encryptedPassword?: string | null): string {
  if (!encryptedPassword) return ''
  return sha256Hex(encryptedPassword).slice(0, 8)
}

function generateAuthToken(
  deploymentId: string,
  type: string,
  encryptedPassword?: string | null,
  authenticatedEmail?: string
): string {
  if (type === 'email' && !authenticatedEmail) {
    throw new Error('Email-auth deployment cookies require an authenticated email')
  }
  if (type !== 'email' && authenticatedEmail) {
    throw new Error(`Deployment auth type ${type} cannot carry an authenticated email`)
  }

  const emailSlot = authenticatedEmail
    ? Buffer.from(normalizeEmail(authenticatedEmail)).toString('base64url')
    : ''
  const payload = `${deploymentId}:${type}:${Date.now()}:${passwordSlot(encryptedPassword)}:${emailSlot}`
  const sig = signPayload(payload)
  return Buffer.from(`${payload}:${sig}`).toString('base64')
}

export interface DeploymentAuthTokenClaims {
  authenticatedEmail?: string
}

/**
 * Verifies and decodes an HMAC-signed deployment authentication token.
 * Email-gated tokens carry the normalized email proven by OTP verification;
 * all other auth modes reject an email claim.
 */
export function readDeploymentAuthToken(
  token: string,
  deploymentId: string,
  authType: string,
  encryptedPassword?: string | null
): DeploymentAuthTokenClaims | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const lastColon = decoded.lastIndexOf(':')
    if (lastColon === -1) return null

    const payload = decoded.slice(0, lastColon)
    const sig = decoded.slice(lastColon + 1)
    if (!safeCompare(sig, signPayload(payload))) return null

    const parts = payload.split(':')
    if (parts.length !== 4 && parts.length !== 5) return null
    const [storedId, storedType, timestamp, storedPwSlot, storedEmailSlot = ''] = parts

    if (storedId !== deploymentId || storedType !== authType) return null
    if (storedPwSlot !== passwordSlot(encryptedPassword)) return null

    const createdAt = Number(timestamp)
    const now = Date.now()
    const expireTime = 24 * 60 * 60 * 1000
    if (!Number.isInteger(createdAt) || createdAt > now || now - createdAt > expireTime) return null

    if (storedType === 'email') {
      if (!storedEmailSlot) return null
      const decodedEmail = Buffer.from(storedEmailSlot, 'base64url').toString()
      const authenticatedEmail = normalizeEmail(decodedEmail)
      if (
        !authenticatedEmail ||
        Buffer.from(authenticatedEmail).toString('base64url') !== storedEmailSlot
      ) {
        return null
      }
      return { authenticatedEmail }
    }

    if (storedEmailSlot) return null
    return {}
  } catch {
    return null
  }
}

/**
 * Validates an HMAC-signed authentication token for a chat deployment.
 * Includes a password-derived slot so changing the deployment password immediately
 * invalidates existing sessions.
 */
export function validateAuthToken(
  token: string,
  deploymentId: string,
  authType: string,
  encryptedPassword?: string | null
): boolean {
  return readDeploymentAuthToken(token, deploymentId, authType, encryptedPassword) !== null
}

/** The kind of deployed resource an auth cookie/token belongs to. */
export type DeploymentAuthKind = 'chat' | 'file'

/** Canonical auth cookie name for a deployed resource (`{kind}_auth_{id}`). */
export function deploymentAuthCookieName(cookiePrefix: DeploymentAuthKind, id: string): string {
  return `${cookiePrefix}_auth_${id}`
}

/**
 * Sets an authentication cookie for a deployment
 */
export function setDeploymentAuthCookie(
  response: NextResponse,
  cookiePrefix: DeploymentAuthKind,
  deploymentId: string,
  authType: string,
  encryptedPassword?: string | null,
  authenticatedEmail?: string
): void {
  const token = generateAuthToken(deploymentId, authType, encryptedPassword, authenticatedEmail)
  response.cookies.set({
    name: deploymentAuthCookieName(cookiePrefix, deploymentId),
    value: token,
    httpOnly: true,
    secure: !isDev,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  })
}

/**
 * Checks if an email matches the allowed emails list (exact match or domain
 * match). Case-insensitive — email addresses are compared lowercased on both
 * sides, so callers don't need to normalize before calling.
 */
export function isEmailAllowed(email: string, allowedEmails: string[]): boolean {
  const normalizedEmail = normalizeEmail(email)
  const normalizedAllowed = allowedEmails.map(normalizeEmail)

  if (normalizedAllowed.includes(normalizedEmail)) {
    return true
  }

  const atIndex = normalizedEmail.indexOf('@')
  if (atIndex > 0) {
    const domain = normalizedEmail.substring(atIndex + 1)
    if (domain && normalizedAllowed.some((allowed) => allowed === `@${domain}`)) {
      return true
    }
  }

  return false
}
