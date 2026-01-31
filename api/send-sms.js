const { SolapiMessageService } = require('solapi');

const ADMIN_PHONE = '01097464689';
const STAFF_PHONE = '01047484689'; // 올리

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reservation } = req.body;

  if (!reservation || !reservation.customerPhone || !reservation.customerName || !reservation.schedules) {
    return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;

  if (!apiKey || !apiSecret || !sender) {
    return res.status(500).json({ error: 'SMS 설정이 완료되지 않았습니다.' });
  }

  const messageService = new SolapiMessageService(apiKey, apiSecret);
  const results = { customer: null, admin: null, staff: null };
  const errors = [];

  // 일정 텍스트 생성
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const scheduleLines = reservation.schedules.map((s, i) => {
    const date = new Date(s.date + 'T00:00:00');
    const dayName = days[date.getDay()];
    return `${i + 1}회 ${s.date}(${dayName}) ${s.time}`;
  }).join('\n');

  // === 1. 고객 문자 ===
  const customerMessage = `${reservation.customerName}님, 한판면접 컨설팅 예약이 확정되었습니다.\n` +
    `* 일정 :\n${scheduleLines}\n` +
    `예약 변경 및 취소는 채널톡으로 연락주세요 :-)\n` +
    `이메일로 사전제출 자료가 발송되었습니다.\n` +
    `컨설팅 2일전까지 제출해주세요.\n` +
    `확인 후 회신부탁드립니다.\n` +
    `감사합니다.`;

  try {
    results.customer = await messageService.sendOne({
      to: reservation.customerPhone.replace(/-/g, ''),
      from: sender,
      text: customerMessage,
    });
  } catch (e) {
    console.error('고객 SMS 발송 실패:', e);
    errors.push({ target: 'customer', error: e.message });
  }

  // === 2. 관리자 문자 ===
  const receiptInfo = reservation.receipt
    ? `발급 (${reservation.receiptNumber || '-'})`
    : '미발급';

  const adminMessage = `[예약확정]\n` +
    `■ 이름: ${reservation.customerName}\n` +
    `■ 연락처: ${reservation.customerPhone}\n` +
    `■ 이메일: ${reservation.customerEmail || '-'}\n` +
    `■ 기업: ${reservation.customerCompany || '-'}\n` +
    `■ 직무: ${reservation.customerPosition || '-'}\n` +
    `■ 면접일: ${reservation.customerInterviewDate || '-'}\n` +
    `■ 면접절차: ${(reservation.interviewTypes || []).join(', ') || '-'}\n` +
    `■ 진행방식: ${reservation.consultMethod || '-'}\n` +
    `■ 현금영수증: ${receiptInfo}\n` +
    `■ 과정: ${reservation.courseName || '-'}\n` +
    `■ 금액: ${reservation.price ? Number(reservation.price).toLocaleString('ko-KR') + '원' : '-'}\n` +
    `■ 일정:\n${scheduleLines}`;

  try {
    results.admin = await messageService.sendOne({
      to: ADMIN_PHONE,
      from: sender,
      text: adminMessage,
    });
  } catch (e) {
    console.error('관리자 SMS 발송 실패:', e);
    errors.push({ target: 'admin', error: e.message });
  }

  // === 3. 직원(올리) 문자 ===
  const staffMessage = `[예약확정]\n` +
    `■ 이름: ${reservation.customerName}\n` +
    `■ 연락처: ${reservation.customerPhone}\n` +
    `■ 기업: ${reservation.customerCompany || '-'}\n` +
    `■ 직무: ${reservation.customerPosition || '-'}\n` +
    `■ 과정: ${reservation.courseName || '-'}\n` +
    `■ 금액: ${reservation.price ? Number(reservation.price).toLocaleString('ko-KR') + '원' : '-'}\n` +
    `■ 현금영수증: ${receiptInfo}`;

  try {
    results.staff = await messageService.sendOne({
      to: STAFF_PHONE,
      from: sender,
      text: staffMessage,
    });
  } catch (e) {
    console.error('직원 SMS 발송 실패:', e);
    errors.push({ target: 'staff', error: e.message });
  }

  if (errors.length === 3) {
    return res.status(500).json({ error: '모든 문자 발송에 실패했습니다.', errors });
  }

  return res.status(200).json({
    success: true,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
};
