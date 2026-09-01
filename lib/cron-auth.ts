import { timingSafeEqual } from 'node:crypto'

export function verifyCronBearerToken(
  authHeader: string | null,
  secret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!secret || !authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.slice(7)

  if (token.length !== secret.length) {
    return false
  }

  try {
    const tokenBuffer = Buffer.from(token, 'utf8')
    const secretBuffer = Buffer.from(secret, 'utf8')
    return timingSafeEqual(tokenBuffer, secretBuffer)
  } catch {
    return false
  }
}
