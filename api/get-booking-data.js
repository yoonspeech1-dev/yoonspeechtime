const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  try {
    const [settings, timeBlocks] = await Promise.all([
      redis.get('settings'),
      redis.get('time_blocks'),
    ]);

    return res.status(200).json({
      settings: settings || { weekdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', interval: 60 },
      timeBlocks: timeBlocks || {},
    });
  } catch (e) {
    console.error('get-booking-data error:', e);
    return res.status(500).json({ error: '데이터 조회 실패' });
  }
};
