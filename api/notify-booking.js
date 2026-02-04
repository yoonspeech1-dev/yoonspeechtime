const { SolapiMessageService } = require('solapi');

const ADMIN_PHONE = '01097464689';
const ADMIN_URL = 'https://yoonspeechtime.vercel.app';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reservation } = req.body;
  if (!reservation || !reservation.customerName) {
    return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;

  if (!apiKey || !apiSecret || !sender) {
    return res.status(500).json({ error: '솔라피 설정이 완료되지 않았습니다.' });
  }

  const messageService = new SolapiMessageService(apiKey, apiSecret);

  const messageText =
    `[윤스피치 예약접수]\n\n` +
    `${reservation.customerName}님이 예약신청했습니다.\n` +
    `승인해주세요.\n\n` +
    `${ADMIN_URL}`;

  try {
    const result = await messageService.sendOne({
      to: ADMIN_PHONE,
      from: sender,
      text: messageText,
    });

    return res.status(200).json({ success: true, result });
  } catch (e) {
    console.error('관리자 알림 발송 실패:', e);
    return res.status(500).json({ error: '알림 발송 실패', detail: e.message });
  }
};
