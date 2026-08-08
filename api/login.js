module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || username !== process.env.ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Galat user id' });
  }
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Galat password' });
  }
  // Simple shared-secret token the frontend will send back on every request
  return res.status(200).json({ token: process.env.ADMIN_PASSWORD });
};
