const { SolapiMessageService } = require('solapi');

const ADMIN_PHONE = '01097464689';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reservation } = req.body;
  if (!reservation || !reservation.customerName || !reservation.schedules) {
    return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;
  const pfId = process.env.SOLAPI_PF_ID; // 카카오톡 채널 ID
  const templateId = process.env.SOLAPI_TEMPLATE_BOOKING; // 예약접수 알림톡 템플릿 ID

  if (!apiKey || !apiSecret || !sender) {
    return res.status(500).json({ error: '솔라피 설정이 완료되지 않았습니다.' });
  }

  const messageService = new SolapiMessageService(apiKey, apiSecret);

  // 일정 텍스트 생성
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const scheduleLines = reservation.schedules.map((s, i) => {
    const date = new Date(s.date + 'T00:00:00');
    const dayName = days[date.getDay()];
    return `  ${i + 1}회 ${s.date}(${dayName}) ${s.time}`;
  }).join('\n');

  const priceText = reservation.price
    ? Number(reservation.price).toLocaleString('ko-KR') + '원'
    : '-';

  const messageText =
    `[새 예약 접수]\n` +
    `■ 이름: ${reservation.customerName}\n` +
    `■ 연락처: ${reservation.customerPhone}\n` +
    `■ 과정: ${reservation.courseName || '-'}\n` +
    `■ 금액: ${priceText}\n` +
    `■ 기업: ${reservation.customerCompany || '-'}\n` +
    `■ 직무: ${reservation.customerPosition || '-'}\n` +
    `■ 면접일: ${reservation.customerInterviewDate || '-'}\n` +
    `■ 진행방식: ${reservation.consultMethod || '-'}\n` +
    `■ 일정:\n${scheduleLines}\n\n` +
    `입금 확인 후 예약 확정 처리해주세요.`;

  try {
    // 카카오톡 알림톡 시도 (pfId, templateId가 설정된 경우)
    if (pfId && templateId) {
      try {
        const result = await messageService.sendOne({
          to: ADMIN_PHONE,
          from: sender,
          kakaoOptions: {
            pfId: pfId,
            templateId: templateId,
            variables: {
              '#{고객명}': reservation.customerName,
              '#{연락처}': reservation.customerPhone,
              '#{과정}': reservation.courseName || '-',
              '#{금액}': priceText,
              '#{일정}': scheduleLines,
            },
          },
        });
        return res.status(200).json({ success: true, type: 'kakao', result });
      } catch (kakaoErr) {
        console.error('카카오 알림톡 실패, SMS 대체 발송:', kakaoErr.message);
      }
    }

    // SMS/LMS 대체 발송
    const result = await messageService.sendOne({
      to: ADMIN_PHONE,
      from: sender,
      text: messageText,
    });

    return res.status(200).json({ success: true, type: 'sms', result });
  } catch (e) {
    console.error('관리자 알림 발송 실패:', e);
    return res.status(500).json({ error: '알림 발송 실패', detail: e.message });
  }
};
