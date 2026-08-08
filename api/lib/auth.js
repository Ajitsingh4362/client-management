const crypto = require('crypto');

function secret() {
  return process.env.ADMIN_PASSWORD || 'fallback-secret';
}

function signToken(username, role) {
  const payload = `${username}|${role}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length !== 3) return null;
    const [username, role, sig] = parts;
    const expected = crypto.createHmac('sha256', secret()).update(`${username}|${role}`).digest('hex');
    if (sig !== expected) return null;
    return { username, role };
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, allowedRoles) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    res.status(403).json({ error: 'Is action ke liye permission nahi hai' });
    return null;
  }
  return user;
}

module.exports = { signToken, verifyToken, requireAuth };
