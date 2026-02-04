const { Redis } = require('@upstash/redis');

function getBlockedSlots(bookedTime, interval) {
  const BLOCK_MINUTES = 120;
  const [h, m] = bookedTime.split(':').map(Number);
  const startMin = h * 60 + m;
  const slots = [];

  for (let min = startMin; min < startMin + BLOCK_MINUTES; min += interval) {
    const slotH = Math.floor(min / 60);
    const slotM = min % 60;
    slots.push(`${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`);
  }
  return slots;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, reservationId, schedules } = req.body;
  if (!action || !reservationId) {
    return res.status(400).json({ error: 'action과 reservationId가 필요합니다.' });
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  try {
    const [reservations, timeBlocks, settings] = await Promise.all([
      redis.get('reservations'),
      redis.get('time_blocks'),
      redis.get('settings'),
    ]);

    const reservationList = reservations || [];
    const tb = timeBlocks || {};
    const interval = (settings && settings.interval) || 60;

    const idx = reservationList.findIndex(r => r.id === reservationId);
    if (idx === -1) {
      return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
    }

    const reservation = reservationList[idx];

    if (action === 'confirm') {
      reservation.status = 'confirmed';

      const currentSchedules = reservation.schedules || [];
      currentSchedules.forEach(({ date, time }) => {
        if (!tb[date]) tb[date] = {};
        getBlockedSlots(time, interval).forEach(slot => {
          tb[date][slot] = 'booked';
        });
      });

      reservationList[idx] = reservation;

    } else if (action === 'delete') {
      const currentSchedules = reservation.schedules || [];
      currentSchedules.forEach(({ date, time }) => {
        if (tb[date]) {
          getBlockedSlots(time, interval).forEach(slot => {
            if (tb[date][slot] === 'booked') {
              tb[date][slot] = 'available';
            }
          });
        }
      });

      reservationList.splice(idx, 1);

    } else if (action === 'edit_schedules') {
      if (!schedules) {
        return res.status(400).json({ error: '새 일정 데이터가 필요합니다.' });
      }

      // 기존 booked 해제
      const oldSchedules = reservation.schedules || [];
      oldSchedules.forEach(({ date, time }) => {
        if (tb[date]) {
          getBlockedSlots(time, interval).forEach(slot => {
            if (tb[date][slot] === 'booked') {
              tb[date][slot] = 'available';
            }
          });
        }
      });

      // confirmed면 새 일정 booked
      if (reservation.status === 'confirmed') {
        schedules.forEach(({ date, time }) => {
          if (!tb[date]) tb[date] = {};
          getBlockedSlots(time, interval).forEach(slot => {
            tb[date][slot] = 'booked';
          });
        });
      }

      reservation.schedules = schedules;
      reservationList[idx] = reservation;

    } else if (action === 'mark_email_sent') {
      reservation.emailSent = true;
      reservationList[idx] = reservation;

    } else {
      return res.status(400).json({ error: '잘못된 action입니다.' });
    }

    // 저장
    await Promise.all([
      redis.set('reservations', reservationList),
      redis.set('time_blocks', tb),
    ]);

    return res.status(200).json({ success: true, timeBlocks: tb });
  } catch (e) {
    console.error('update-reservation error:', e);
    return res.status(500).json({ error: '예약 업데이트 실패' });
  }
};
