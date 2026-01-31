const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { timeBlocks } = req.body;
  if (timeBlocks === undefined) {
    return res.status(400).json({ error: 'timeBlocks 데이터가 필요합니다.' });
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  try {
    await redis.set('time_blocks', timeBlocks);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('save-time-blocks error:', e);
    return res.status(500).json({ error: '타임블록 저장 실패' });
  }
};
