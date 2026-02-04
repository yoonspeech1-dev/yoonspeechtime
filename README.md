# 윤스피치 - 1:1 면접 컨설팅 예약 시스템

한판면접 프리미엄 1:1 컨설팅 예약 및 관리 시스템

## 주요 기능

### 고객 예약 페이지 (`booking.html`)
- 4단계 예약 프로세스: 과정 선택 → 일정 선택 → 신청서 작성 → 입금 안내
- 과정: 올케어(3회), 퍼펙트(5회), 피니쉬(8회), 직접입력
- 캘린더 기반 일정 선택 (운영 요일/시간 자동 반영)
- 모바일 최적화 UI

### 관리자 대시보드 (`index.html`)
- 예약 목록 조회 및 필터링 (입금대기/예약확정)
- 예약 확정 처리 및 자동 SMS 발송
- 사전 제출 자료 이메일 발송 (Resend)
- 캘린더 시간대 관리 (운영 요일, 시간, 간격 설정)

### 알림 시스템
- 고객 예약 접수 시 → 관리자 SMS 알림 (솔라피)
- 관리자 예약 확정 시 → 고객/관리자/직원 SMS 발송 (솔라피)
- 사전 제출 자료 이메일 발송 (Resend)

## 기술 스택

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Upstash Redis
- **SMS**: 솔라피 (Solapi)
- **Email**: Resend
- **배포**: Vercel

## 프로젝트 구조

```
├── index.html              # 관리자 대시보드
├── booking.html            # 고객 예약 페이지
├── css/
│   ├── style.css           # 관리자 페이지 스타일
│   └── booking.css         # 고객 예약 페이지 스타일
├── js/
│   ├── app.js              # 관리자 대시보드 로직
│   └── booking.js          # 고객 예약 프로세스 로직
├── api/
│   ├── create-reservation.js   # 예약 생성
│   ├── update-reservation.js   # 예약 확정/수정/삭제
│   ├── get-data.js             # 관리자 데이터 조회
│   ├── get-booking-data.js     # 고객 예약 데이터 조회
│   ├── save-settings.js        # 운영 설정 저장
│   ├── save-time-blocks.js     # 시간대 관리
│   ├── send-sms.js             # 예약 확정 SMS 발송
│   ├── send-email.js           # 사전 제출 자료 이메일 발송
│   └── notify-booking.js       # 예약 접수 관리자 알림
├── vercel.json
└── package.json
```

## 환경 변수 (Vercel)

```
UPSTASH_REDIS_REST_URL=     # Upstash Redis URL
UPSTASH_REDIS_REST_TOKEN=   # Upstash Redis 토큰
SOLAPI_API_KEY=             # 솔라피 API Key
SOLAPI_API_SECRET=          # 솔라피 API Secret
SOLAPI_SENDER=              # 솔라피 발신번호
RESEND_API_KEY=             # Resend API Key
```
