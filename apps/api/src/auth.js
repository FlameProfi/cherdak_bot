const crypto = require('crypto');

const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_WEB_TOKEN || 'cherdak-secret';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  if (!storedValue || !password) return false;
  const [salt, originalHash] = storedValue.split(':');
  if (!salt || !originalHash) return false;
  const computedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(computedHash, 'hex'));
}

function createAdminToken(payload) {
  const body = {
    sub: payload.id,
    username: payload.username,
    role: payload.role,
    displayName: payload.display_name,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function parseAdminToken(token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(encoded).digest('base64url');

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function roleAllows(role, requiredRole) {
  const levels = {
    host: 1,
    admin: 2,
    owner: 3
  };

  return (levels[role] || 0) >= (levels[requiredRole] || 0);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createAdminToken,
  parseAdminToken,
  roleAllows
};
