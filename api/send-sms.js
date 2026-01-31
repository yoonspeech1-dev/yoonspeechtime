const { SolapiMessageService } = require('solapi');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, customerName, courseName, schedules } = req.body;

  if (!to || !customerName || !courseName || !schedules || schedules.length === 0) {
    return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;

  if (!apiKey || !apiSecret || !sender) {
    return res.status(500).json({ error: 'SMS 설정이 완료되지 않았습니다.' });
  }

  // 일정 텍스트 생성
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const scheduleLines = schedules.map((s, i) => {
    const date = new Date(s.date + 'T00:00:00');
    const dayName = days[date.getDay()];
    return `- ${i + 1}회 ${s.date}(${dayName}) ${s.time}`;
  }).join('\n');

  const message = `[윤스피치] ${customerName}님, 예약이 확정되었습니다.\n\n■ 과정: ${courseName}\n■ 일정:\n${scheduleLines}\n\n감사합니다.`;

  try {
    const messageService = new SolapiMessageService(apiKey, apiSecret);
    const result = await messageService.sendOne({
      to,
      from: sender,
      text: message,
    });

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('SMS 발송 실패:', error);
    return res.status(500).json({ error: '문자 발송에 실패했습니다.', detail: error.message });
  }
};
