import { timingSafeEqual } from 'node:crypto';

const BEARER_PREFIX = 'Bearer ';
const MAX_TOKEN_BYTES = 512;

const compareTimingSafe = (token: string, secret: string): boolean => {
  const tokenBuffer = Buffer.from(token, 'utf8');
  const secretBuffer = Buffer.from(secret, 'utf8');

  if (tokenBuffer.length > MAX_TOKEN_BYTES) return false;

  const maxLen = Math.max(tokenBuffer.length, secretBuffer.length, 1);
  const paddedToken = Buffer.alloc(maxLen);
  const paddedSecret = Buffer.alloc(maxLen);
  tokenBuffer.copy(paddedToken);
  secretBuffer.copy(paddedSecret);

  const equalLength = tokenBuffer.length === secretBuffer.length;
  const equalContent = timingSafeEqual(paddedToken, paddedSecret);
  return equalLength && equalContent;
};

export const verifyBearerToken = (
  request: Request,
  ...secrets: Array<string | undefined>
): boolean => {
  const validSecrets = secrets.filter(
    (s): s is string => typeof s === 'string' && s.trim() !== '',
  );
  if (validSecrets.length === 0) return false;

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) return false;

  const token = authHeader.slice(BEARER_PREFIX.length);
  if (token.length === 0) return false;

  let matched = false;
  for (const secret of validSecrets) {
    if (compareTimingSafe(token, secret)) matched = true;
  }
  return matched;
};
