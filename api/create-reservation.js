const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reservation } = req.body;
  if (!reservation) {
    return res.status(400).json({ error: '예약 데이터가 필요합니다.' });
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  try {
    // 기존 데이터 가져오기
    const [reservations, timeBlocks, settings] = await Promise.all([
      redis.get('reservations'),
      redis.get('time_blocks'),
      redis.get('settings'),
    ]);

    const reservationList = reservations || [];
    const tb = timeBlocks || {};
    const interval = (settings && settings.interval) || 60;
    const BLOCK_MINUTES = 120;

    // 예약 추가
    reservationList.push(reservation);

    // time_blocks 업데이트 (120분 블록)
    reservation.schedules.forEach(schedule => {
      if (!tb[schedule.date]) tb[schedule.date] = {};

      const [h, m] = schedule.time.split(':').map(Number);
      const startMin = h * 60 + m;

      for (let min = startMin; min < startMin + BLOCK_MINUTES; min += interval) {
        const slotH = Math.floor(min / 60);
        const slotM = min % 60;
        const slot = `${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`;
        tb[schedule.date][slot] = 'booked';
      }
    });

    // 저장
    await Promise.all([
      redis.set('reservations', reservationList),
      redis.set('time_blocks', tb),
    ]);

    return res.status(200).json({ success: true, timeBlocks: tb });
  } catch (e) {
    console.error('create-reservation error:', e);
    return res.status(500).json({ error: '예약 생성 실패' });
  }
};
