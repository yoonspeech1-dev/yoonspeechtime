const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reservation } = req.body;

  if (!reservation || !reservation.customerEmail || !reservation.customerName || !reservation.schedules) {
    return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '이메일 설정이 완료되지 않았습니다.' });
  }

  const resend = new Resend(apiKey);
  const customerName = reservation.customerName;

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#333;line-height:1.8;">
      <div style="padding:24px;background:#fff;">
        안녕하세요, ${customerName}님 윤쌤입니다. 😊<br/><br/>

        컨설팅 전에 사전 질문지를 작성해주시면, 더욱 체계적이고 효과적인 준비가 가능합니다.<br/>
        첨부된 양식을 작성해주시고, 아래 제출 기한에 맞춰 보내주세요.<br/><br/>

        특히, 면탈 경험이 있으시다면 복기록 작성이 매우 중요합니다.<br/>
        기억을 최대한 복기하셔서 복기록 부분을 꼼꼼히 작성해주세요.<br/><br/>

        사전 질문지를 작성하는 과정은 면접 준비의 첫걸음이 됩니다!<br/><br/>

        <b>1) 제출 기한 :</b> 컨설팅 2일 전<br/><br/>

        <b>2) 제출 자료:</b><br/>
        컨설팅 사전 질문지 양식 작성본<br/>
        📁 <a href="https://naver.me/F160Ddqn">양식 다운로드하기</a><br/>
        채용공고문/면접 안내문 (공고문 없을 시 링크로 전달)<br/>
        입사지원서(이력서)·자기소개서 등<br/>
        그 외 도움이 될 만한 자료<br/><br/>

        작성 완료 후, 이메일로 회신 주시면 됩니다.<br/>
        <b style="color:#dc2626;">반드시 해당 메일에서 답장하기로 이메일을 보내주시거나 yoon_speech@naver.com 로 제출해주세요!</b><br/><br/>

        그럼 ${customerName}님! 컨설팅 당일에 뵙겠습니다.<br/>
        감사합니다. 😊
      </div>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: '윤스피치 <yoonsoyoon@yoonspeechtime.com>',
      replyTo: 'yoon_speech@naver.com',
      to: [reservation.customerEmail],
      subject: `[한판면접] ${customerName}님 사전제출자료 안내드립니다.`,
      html,
    });

    if (error) {
      console.error('이메일 발송 실패:', error);
      return res.status(500).json({ error: '이메일 발송에 실패했습니다.', detail: error });
    }

    return res.status(200).json({ success: true, data });
  } catch (e) {
    console.error('이메일 발송 오류:', e);
    return res.status(500).json({ error: '이메일 발송 중 오류가 발생했습니다.' });
  }
};
