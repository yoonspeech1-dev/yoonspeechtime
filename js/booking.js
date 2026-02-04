// ===== 윤스피치 고객 예약 페이지 =====

// 과정 정보 (금액은 과정 선택 화면에 표시하지 않음)
const COURSES = {
    allcare: { name: '올케어', sessions: 3, price: 950000 },
    perfect: { name: '퍼펙트', sessions: 5, price: 1400000 },
    finish: { name: '피니쉬', sessions: 8, price: 2000000 },
    custom: { name: '직접입력', sessions: 0, pricePerSession: 400000 }
};

// 상태 관리
const bookingState = {
    currentStep: 1,
    currentDate: new Date(),
    // Step 1
    selectedCourse: null,
    customSessions: 1,
    totalSessions: 0,
    // Step 2
    selectedSchedules: [], // [{ date: 'YYYY-MM-DD', time: 'HH:MM' }, ...]
    viewingDate: null, // 현재 시간 선택 중인 날짜
    // 관리자 데이터
    settings: {
        weekdays: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '18:00',
        interval: 60
    },
    timeBlocks: {},
    reservations: []
};

// ===== 유틸리티 =====
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDateKorean(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
}

function formatPrice(price) {
    return price.toLocaleString('ko-KR') + '원';
}

function showToast(message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function generateBookingId() {
    const now = new Date();
    const dateStr = formatDate(now).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `YS${dateStr}${random}`;
}

// ===== 가격 계산 =====
function calculatePrice() {
    if (!bookingState.selectedCourse) return 0;
    const course = COURSES[bookingState.selectedCourse];
    if (bookingState.selectedCourse === 'custom') {
        return bookingState.customSessions * course.pricePerSession;
    }
    return course.price;
}

function getCourseName() {
    if (!bookingState.selectedCourse) return '';
    const course = COURSES[bookingState.selectedCourse];
    if (bookingState.selectedCourse === 'custom') {
        return `직접입력 (${bookingState.customSessions}회)`;
    }
    return `${course.name} (${course.sessions}회)`;
}

// ===== 데이터 로드/저장 =====
async function loadAdminData() {
    try {
        const res = await fetch('/api/get-booking-data');
        if (!res.ok) throw new Error('서버 응답 오류');
        const data = await res.json();
        if (data.settings) bookingState.settings = data.settings;
        if (data.timeBlocks) bookingState.timeBlocks = data.timeBlocks;
    } catch (e) {
        console.error('데이터 로드 실패:', e);
        showToast('데이터를 불러오는데 실패했습니다');
    }
}

// 예약 시간 기준으로 블록해야 할 슬롯 목록 반환 (컨설팅 90분 + 준비 30분 = 120분)
function getBookingBlockedSlots(bookedTime) {
    const BLOCK_MINUTES = 120;
    const [h, m] = bookedTime.split(':').map(Number);
    const startMin = h * 60 + m;
    const interval = bookingState.settings.interval || 60;
    const slots = [];

    for (let min = startMin; min < startMin + BLOCK_MINUTES; min += interval) {
        const slotH = Math.floor(min / 60);
        const slotM = min % 60;
        slots.push(`${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`);
    }
    return slots;
}

async function saveReservation(reservation) {
    try {
        const res = await fetch('/api/create-reservation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservation }),
        });
        if (!res.ok) throw new Error('예약 저장 실패');
        const data = await res.json();
        if (data.timeBlocks) bookingState.timeBlocks = data.timeBlocks;
    } catch (e) {
        console.error('예약 저장 실패:', e);
        showToast('예약 저장에 실패했습니다. 다시 시도해주세요.');
        throw e;
    }
}

// ===== 예약 가능 여부 =====
function isOperatingDay(dayOfWeek) {
    return bookingState.settings.weekdays.includes(dayOfWeek);
}

function isDateAvailable(dateStr) {
    const blocks = bookingState.timeBlocks[dateStr];
    if (!blocks) return false;
    return Object.values(blocks).includes('available');
}

function getAvailableTimeSlots(dateStr) {
    const blocks = bookingState.timeBlocks[dateStr];
    if (!blocks) return [];
    return Object.entries(blocks)
        .filter(([_, status]) => status === 'available')
        .map(([time]) => time)
        .sort();
}

// 이미 선택된 일정인지 확인
function isTimeSelected(dateStr, time) {
    return bookingState.selectedSchedules.some(s => s.date === dateStr && s.time === time);
}

// 선택된 시간에 의해 블록된 시간인지 확인 (컨설팅 90분 + 준비 30분 = 120분)
function isTimeBlockedBySelection(dateStr, time) {
    const BLOCK_MINUTES = 120; // 컨설팅 90분 + 준비시간 30분
    const [checkH, checkM] = time.split(':').map(Number);
    const checkMinutes = checkH * 60 + checkM;

    return bookingState.selectedSchedules.some(s => {
        if (s.date !== dateStr) return false;
        // 같은 날짜에서 이미 선택된 시간이면 블록 대상 아님 (자기 자신은 제외)
        if (s.time === time) return false;

        const [selH, selM] = s.time.split(':').map(Number);
        const selMinutes = selH * 60 + selM;

        // 선택된 시간 이후 120분 이내의 슬롯은 블록
        if (checkMinutes > selMinutes && checkMinutes < selMinutes + BLOCK_MINUTES) {
            return true;
        }
        // 체크 시간 이후 120분 이내에 선택된 시간이 있으면 블록
        if (selMinutes > checkMinutes && selMinutes < checkMinutes + BLOCK_MINUTES) {
            return true;
        }
        return false;
    });
}

// ===== Step 1: 과정 선택 =====
function initStep1() {
    const courseRadios = document.querySelectorAll('input[name="course"]');
    const customSection = document.getElementById('customInputSection');
    const nextBtn = document.getElementById('toStep2Btn');

    courseRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            bookingState.selectedCourse = radio.value;

            if (radio.value === 'custom') {
                customSection.style.display = 'block';
                bookingState.totalSessions = bookingState.customSessions;
            } else {
                customSection.style.display = 'none';
                bookingState.totalSessions = COURSES[radio.value].sessions;
            }

            nextBtn.disabled = false;
        });
    });

    // 직접입력 수량 버튼
    document.getElementById('qtyMinus').addEventListener('click', (e) => {
        e.preventDefault();
        const input = document.getElementById('customSessions');
        const val = parseInt(input.value);
        if (val > 1) {
            input.value = val - 1;
            bookingState.customSessions = val - 1;
            bookingState.totalSessions = val - 1;
        }
    });

    document.getElementById('qtyPlus').addEventListener('click', (e) => {
        e.preventDefault();
        const input = document.getElementById('customSessions');
        const val = parseInt(input.value);
        if (val < 20) {
            input.value = val + 1;
            bookingState.customSessions = val + 1;
            bookingState.totalSessions = val + 1;
        }
    });

    document.getElementById('customSessions').addEventListener('change', (e) => {
        let val = parseInt(e.target.value) || 1;
        val = Math.max(1, Math.min(20, val));
        e.target.value = val;
        bookingState.customSessions = val;
        bookingState.totalSessions = val;
    });

    nextBtn.addEventListener('click', () => {
        if (!bookingState.selectedCourse) return;
        // 과정 변경 시 선택한 일정 초기화
        bookingState.selectedSchedules = [];
        bookingState.viewingDate = null;
        goToStep(2);
    });
}

// ===== Step 2: 일정 선택 =====
function renderCalendar() {
    const year = bookingState.currentDate.getFullYear();
    const month = bookingState.currentDate.getMonth();

    document.getElementById('currentMonth').textContent = `${year}년 ${month + 1}월`;

    const calendarDays = document.getElementById('calendarDays');
    calendarDays.innerHTML = '';

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDay = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 이전 달 빈 칸
    const prevMonth = new Date(year, month, 0);
    const prevMonthDays = prevMonth.getDate();
    for (let i = startingDay - 1; i >= 0; i--) {
        const el = document.createElement('div');
        el.className = 'calendar-day empty disabled non-operating';
        el.innerHTML = `<span class="day-number">${prevMonthDays - i}</span>`;
        calendarDays.appendChild(el);
    }

    // 현재 달
    for (let day = 1; day <= totalDays; day++) {
        const el = document.createElement('div');
        el.className = 'calendar-day';

        const currentDate = new Date(year, month, day);
        const dateStr = formatDate(currentDate);
        const dayOfWeek = currentDate.getDay();
        const isPast = currentDate < today;
        const isOperating = isOperatingDay(dayOfWeek);
        const hasAvailable = isDateAvailable(dateStr);

        // 이 날짜에 이미 선택된 일정이 있는지
        const hasSelection = bookingState.selectedSchedules.some(s => s.date === dateStr);

        if (isPast) el.classList.add('disabled');

        let statusHtml = '';

        if (!isOperating || isPast) {
            el.classList.add('non-operating');
        } else if (hasAvailable) {
            el.classList.add('operating', 'has-available');
            statusHtml = '<span class="day-status available">예약 가능</span>';
        } else {
            el.classList.add('operating');
            statusHtml = '<span class="day-status closed">마감</span>';
        }

        if (hasSelection) {
            el.classList.add('has-selected');
        }

        if (bookingState.viewingDate === dateStr) {
            el.classList.add('selected');
        }

        if (currentDate.getTime() === today.getTime()) {
            el.classList.add('today');
        }

        el.innerHTML = `
            <span class="day-number">${day}</span>
            ${statusHtml}
        `;

        if (!isPast && isOperating && hasAvailable) {
            el.addEventListener('click', () => openTimeSelect(dateStr));
            el.style.cursor = 'pointer';
        }

        calendarDays.appendChild(el);
    }

    // 다음 달 빈 칸 (현재 주만 채움)
    const totalCells = startingDay + totalDays;
    const remainInRow = totalCells % 7;
    if (remainInRow > 0) {
        for (let i = 1; i <= 7 - remainInRow; i++) {
            const el = document.createElement('div');
            el.className = 'calendar-day empty disabled';
            el.innerHTML = `<span class="day-number">${i}</span>`;
            calendarDays.appendChild(el);
        }
    }
}

function openTimeSelect(dateStr) {
    bookingState.viewingDate = dateStr;
    renderCalendar();

    const card = document.getElementById('timeSelectCard');
    card.style.display = 'block';

    document.getElementById('timeSelectDate').textContent = formatDateKorean(dateStr);

    renderTimeSlots(dateStr);

    // 스크롤 이동
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function getSessionNumberForSlot(dateStr, time) {
    // 이미 선택된 일정을 날짜+시간순으로 정렬
    const sorted = [...bookingState.selectedSchedules].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
    });
    const idx = sorted.findIndex(s => s.date === dateStr && s.time === time);
    return idx > -1 ? idx + 1 : null;
}

function getNextSessionNumber() {
    return bookingState.selectedSchedules.length + 1;
}

// 해당 날짜에 이미 선택된 시간이 있는지 확인
function hasSelectionOnDate(dateStr) {
    return bookingState.selectedSchedules.some(s => s.date === dateStr);
}

function renderTimeSlots(dateStr) {
    const container = document.getElementById('timeSlots');
    const availableSlots = getAvailableTimeSlots(dateStr);
    const nextSession = getNextSessionNumber();

    if (availableSlots.length === 0) {
        container.innerHTML = '<p class="empty-state">예약 가능한 시간이 없습니다</p>';
        return;
    }

    // 이 날짜에 이미 선택된 시간이 있는지 확인 (하루 1타임 제한)
    const dateHasSelection = hasSelectionOnDate(dateStr);

    // 현재 선택 중인 회차 안내
    const sessionGuide = nextSession <= bookingState.totalSessions
        ? `<div class="session-guide">${nextSession}회차 시간을 선택해주세요</div>`
        : '';

    container.innerHTML = sessionGuide + availableSlots.map(time => {
        const selected = isTimeSelected(dateStr, time);
        const blocked = !selected && (isTimeBlockedBySelection(dateStr, time) || (dateHasSelection && !selected));
        const sessionNum = selected ? getSessionNumberForSlot(dateStr, time) : null;
        const blockedLabel = !selected && dateHasSelection ? '하루 1타임' : (blocked ? '선택 불가' : '');
        return `
            <div class="time-slot ${selected ? 'selected' : ''} ${blocked ? 'blocked' : ''}" data-date="${dateStr}" data-time="${time}">
                ${selected && sessionNum ? `<span class="time-session-badge">${sessionNum}회차</span>` : ''}
                <span class="time-value">${time}</span>
                <span class="time-duration">90분</span>
                ${selected ? '<span class="time-check">✓</span>' : ''}
                ${blocked ? `<span class="time-blocked-label">${blockedLabel}</span>` : ''}
            </div>
        `;
    }).join('');

    container.querySelectorAll('.time-slot:not(.blocked)').forEach(slot => {
        slot.addEventListener('click', () => {
            toggleTimeSlot(slot.dataset.date, slot.dataset.time);
        });
    });
}

function toggleTimeSlot(date, time) {
    const idx = bookingState.selectedSchedules.findIndex(s => s.date === date && s.time === time);

    if (idx > -1) {
        // 이미 선택된 시간 -> 제거
        bookingState.selectedSchedules.splice(idx, 1);
    } else {
        // 최대 횟수 확인
        if (bookingState.selectedSchedules.length >= bookingState.totalSessions) {
            showToast(`최대 ${bookingState.totalSessions}개까지 선택할 수 있습니다`);
            return;
        }
        bookingState.selectedSchedules.push({ date, time });
    }

    // UI 업데이트
    renderCalendar();
    updateSelectedSchedulesUI();
    updateStep2Button();

    // 시간 슬롯 UI 업데이트
    renderTimeSlots(date);

    // 새로 선택한 경우: 다음 회차 안내 토스트 표시 (타임박스는 유지)
    const remaining = bookingState.totalSessions - bookingState.selectedSchedules.length;
    if (idx === -1 && remaining > 0) {
        const nextSession = bookingState.selectedSchedules.length + 1;
        showToast(`다음 ${nextSession}회차 날짜 및 시간을 캘린더에서 선택해주세요`);
    }
}

function updateSelectedSchedulesUI() {
    const container = document.getElementById('selectedSchedules');
    const tagsContainer = document.getElementById('scheduleTags');
    const countEl = document.getElementById('selectedCount');
    const totalEl = document.getElementById('totalCount');
    const totalDisplay = document.getElementById('totalSessionsDisplay');

    const count = bookingState.selectedSchedules.length;
    const total = bookingState.totalSessions;

    countEl.textContent = count;
    totalEl.textContent = total;
    totalDisplay.textContent = total;

    if (count > 0) {
        container.style.display = 'block';

        // 날짜순 정렬
        const sorted = [...bookingState.selectedSchedules].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.time.localeCompare(b.time);
        });

        tagsContainer.innerHTML = sorted.map((s, i) => `
            <div class="schedule-tag">
                <span class="tag-number">${i + 1}회차</span>
                <span class="tag-info">${formatDateKorean(s.date)} ${s.time}</span>
                <button class="tag-remove" data-date="${s.date}" data-time="${s.time}">×</button>
            </div>
        `).join('');

        tagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTimeSlot(btn.dataset.date, btn.dataset.time);
            });
        });
    } else {
        container.style.display = 'none';
    }
}

function updateStep2Button() {
    const btn = document.getElementById('toStep3Btn');
    btn.disabled = bookingState.selectedSchedules.length < bookingState.totalSessions;
}

function initStep2() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        bookingState.currentDate.setDate(1);
        bookingState.currentDate.setMonth(bookingState.currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        bookingState.currentDate.setDate(1);
        bookingState.currentDate.setMonth(bookingState.currentDate.getMonth() + 1);
        renderCalendar();
    });

    document.getElementById('backToStep1').addEventListener('click', () => {
        goToStep(1);
    });

    document.getElementById('toStep3Btn').addEventListener('click', () => {
        if (bookingState.selectedSchedules.length < bookingState.totalSessions) {
            showToast(`${bookingState.totalSessions}개 시간을 모두 선택해주세요`);
            return;
        }
        goToStep(3);
    });
}

// ===== Step 3: 신청서 =====
function renderStep3() {
    // 과정 정보
    document.getElementById('step3CourseInfo').textContent = getCourseName();

    // 선택한 일정 요약
    const schedulesContainer = document.getElementById('step3Schedules');
    const sorted = [...bookingState.selectedSchedules].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
    });

    schedulesContainer.innerHTML = `
        <div class="schedule-summary-card">
            ${sorted.map((s, i) => `
                <div class="schedule-summary-row">
                    <span class="schedule-num">${i + 1}회차</span>
                    <span class="schedule-datetime">${formatDateKorean(s.date)} ${s.time}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function initStep3() {
    // 현금영수증 토글
    document.querySelectorAll('input[name="receipt"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const group = document.getElementById('receiptNumberGroup');
            group.style.display = radio.value === 'yes' && radio.checked ? 'block' : 'none';
        });
    });

    // 전화번호 동일 버튼
    document.getElementById('samePhoneBtn').addEventListener('click', () => {
        const phone = document.getElementById('customerPhone').value.trim();
        if (phone) {
            document.getElementById('receiptNumber').value = phone;
        } else {
            showToast('전화번호를 먼저 입력해주세요');
        }
    });

    // 면접 절차 - 기타 직접입력 토글
    document.querySelectorAll('input[name="interviewType"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const etcChecked = document.querySelector('input[name="interviewType"][value="기타"]').checked;
            document.getElementById('interviewTypeEtcGroup').style.display = etcChecked ? 'block' : 'none';
        });
    });

    // 윤쌤 알게된 경로 - 기타 직접입력 토글
    document.querySelectorAll('input[name="referral"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const etcChecked = document.querySelector('input[name="referral"][value="기타"]').checked;
            document.getElementById('referralEtcGroup').style.display = etcChecked ? 'block' : 'none';
        });
    });

    document.getElementById('backToStep2').addEventListener('click', () => {
        goToStep(2);
    });

    document.getElementById('bookingForm').addEventListener('submit', handleSubmit);
}

async function handleSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const name = form.customerName.value.trim();
    const age = form.customerAge.value.trim();
    const phone = form.customerPhone.value.trim();
    const receiptType = form.receipt.value;
    const receiptNumber = form.receiptNumber ? form.receiptNumber.value.trim() : '';
    const email = form.customerEmail.value.trim();
    const region = form.customerRegion.value.trim();
    const company = form.customerCompany.value.trim();
    const position = form.customerPosition.value.trim();
    const interviewDate = form.customerInterviewDate.value.trim();

    // 면접 절차 (다중선택)
    const interviewTypes = [...document.querySelectorAll('input[name="interviewType"]:checked')].map(cb => cb.value);
    const interviewTypeEtc = form.interviewTypeEtc ? form.interviewTypeEtc.value.trim() : '';
    if (interviewTypes.includes('기타') && interviewTypeEtc) {
        const idx = interviewTypes.indexOf('기타');
        interviewTypes[idx] = `기타: ${interviewTypeEtc}`;
    }

    // 컨설팅 방식
    const consultMethod = form.consultMethod ? form.consultMethod.value : '';

    // 알게된 경로 (다중선택)
    const referrals = [...document.querySelectorAll('input[name="referral"]:checked')].map(cb => cb.value);
    const referralEtc = form.referralEtc ? form.referralEtc.value.trim() : '';
    if (referrals.includes('기타') && referralEtc) {
        const idx = referrals.indexOf('기타');
        referrals[idx] = `기타: ${referralEtc}`;
    }

    // 환불정책 동의
    const refundAgree = form.refundAgree.checked;

    // 개인정보 동의
    const privacyAgree = form.privacyAgree ? form.privacyAgree.value : '';

    // 유효성 검사
    if (!name || !age || !phone || !email || !region || !company || !position || !interviewDate) {
        showToast('필수 항목을 모두 입력해주세요');
        return;
    }

    const phoneRegex = /^01[0-9]{1}[0-9]{3,4}[0-9]{4}$/;
    if (!phoneRegex.test(phone.replace(/-/g, ''))) {
        showToast('올바른 전화번호를 입력해주세요');
        return;
    }

    if (receiptType === 'yes' && !receiptNumber) {
        showToast('현금영수증 발급 번호를 입력해주세요');
        return;
    }

    if (interviewTypes.length === 0) {
        showToast('면접 진행 해당 절차를 선택해주세요');
        return;
    }

    if (!consultMethod) {
        showToast('컨설팅 진행 희망 방식을 선택해주세요');
        return;
    }

    if (referrals.length === 0) {
        showToast('윤쌤을 알게 된 경로를 선택해주세요');
        return;
    }

    if (!refundAgree) {
        showToast('환불정책에 동의해주세요');
        return;
    }

    if (!privacyAgree) {
        showToast('개인정보 이용 동의를 선택해주세요');
        return;
    }

    // 예약 데이터 생성
    const sorted = [...bookingState.selectedSchedules].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
    });

    const reservation = {
        id: generateBookingId(),
        course: bookingState.selectedCourse,
        courseName: getCourseName(),
        price: calculatePrice(),
        sessions: bookingState.totalSessions,
        schedules: sorted,
        customerName: name,
        customerAge: age,
        customerPhone: phone,
        customerEmail: email,
        customerRegion: region,
        customerCompany: company,
        customerPosition: position,
        customerInterviewDate: interviewDate,
        interviewTypes: interviewTypes,
        consultMethod: consultMethod,
        referrals: referrals,
        receipt: receiptType === 'yes',
        receiptNumber: receiptType === 'yes' ? receiptNumber : '',
        refundAgree: refundAgree,
        privacyAgree: privacyAgree,
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    // 저장
    try {
        await saveReservation(reservation);
    } catch (e) {
        return; // 저장 실패 시 중단
    }

    // 관리자 알림 전송 (실패해도 예약 진행에 영향 없음)
    try {
        await fetch('/api/notify-booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservation })
        });
    } catch (e) {
        console.error('관리자 알림 전송 실패:', e);
    }

    // Step 4로 이동
    showStep4(reservation);
}

// ===== Step 4: 입금 안내 =====
function showStep4(reservation) {
    document.getElementById('paymentName').textContent = reservation.customerName;
    document.getElementById('paymentAmount').textContent = formatPrice(reservation.price);
    document.getElementById('summaryCourseName').textContent = reservation.courseName;

    // 일정 목록
    const schedulesContainer = document.getElementById('summarySchedules');
    schedulesContainer.innerHTML = reservation.schedules.map((s, i) => `
        <div class="summary-item">
            <span class="summary-label">${i + 1}회차</span>
            <span class="summary-value">${formatDateKorean(s.date)} ${s.time}</span>
        </div>
    `).join('');

    // 계좌 복사 기능
    document.getElementById('copyAccountBtn').addEventListener('click', () => {
        const accountText = '국민은행 49810201307635';
        navigator.clipboard.writeText(accountText).then(() => {
            showToast('계좌번호가 복사되었습니다');
        }).catch(() => {
            // fallback
            const textarea = document.createElement('textarea');
            textarea.value = accountText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('계좌번호가 복사되었습니다');
        });
    });

    goToStep(4);
}

// ===== 스텝 관리 =====
function goToStep(step) {
    bookingState.currentStep = step;

    // 헤더 compact 토글 (2단계 이후 compact)
    const header = document.getElementById('bookingHeader');
    if (header) {
        if (step >= 2) {
            header.classList.add('compact');
        } else {
            header.classList.remove('compact');
        }
    }

    // 모든 스텝 숨기기
    document.querySelectorAll('.booking-step').forEach(s => s.style.display = 'none');

    // 현재 스텝 표시
    document.getElementById(`step${step}`).style.display = 'block';

    // 인디케이터 업데이트
    document.querySelectorAll('.step-indicator .step').forEach(s => {
        const num = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (num < step) s.classList.add('completed');
        else if (num === step) s.classList.add('active');
    });

    // 스텝별 초기화
    if (step === 2) {
        updateSelectedSchedulesUI();
        updateStep2Button();
        renderCalendar();
        document.getElementById('timeSelectCard').style.display = bookingState.viewingDate ? 'block' : 'none';
    } else if (step === 3) {
        renderStep3();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== 초기화 =====
async function init() {
    // 로딩 표시
    document.body.classList.add('loading');

    await loadAdminData();

    initStep1();
    initStep2();
    initStep3();

    // 로딩 해제
    document.body.classList.remove('loading');
}

document.addEventListener('DOMContentLoaded', init);
