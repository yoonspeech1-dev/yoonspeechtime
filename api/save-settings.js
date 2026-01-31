const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { settings } = req.body;
  if (!settings) {
    return res.status(400).json({ error: 'settings 데이터가 필요합니다.' });
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  try {
    await redis.set('settings', settings);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('save-settings error:', e);
    return res.status(500).json({ error: '설정 저장 실패' });
  }
};
