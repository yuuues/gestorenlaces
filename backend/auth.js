const crypto = require('crypto');

// Authorization middleware for write/config routes. The admin key is read from
// the ADMIN_KEY environment variable (set in the repo-root .env, never in code
// or git). Read routes stay public; only mutating routes use this.

// Constant-time comparison. Hashing both sides to a fixed-length digest first
// means timingSafeEqual never throws on length mismatch and the key length is
// not leaked through timing.
const keysMatch = (provided, expected) => {
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
};

const requireAuth = (req, res, next) => {
  const adminKey = process.env.ADMIN_KEY;

  // Fail closed: if no key is configured, management is disabled rather than open.
  if (!adminKey) {
    return res.status(503).json({ error: 'Gestión deshabilitada: ADMIN_KEY no configurada' });
  }

  const provided = req.get('x-admin-key');
  if (!provided || !keysMatch(provided, adminKey)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  next();
};

module.exports = { requireAuth };
