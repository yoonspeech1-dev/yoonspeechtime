// ===== 윤스피치 고객 예약 페이지 =====

// 상태 관리
const bookingState = {
    currentDate: new Date(),
    selectedDate: null,
    selectedTime: null,
    currentStep: 1,
    // 관리자가 설정한 데이터 (localStorage에서 로드)
    settings: {
        weekdays: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '18:00',
        interval: 60
    },
    timeBlocks: {},
    reservations: [],
    // 과정 정보
    courses: {
        basic: { name: '기본 컨설팅', price: 150000 },
        standard: { name: '스탠다드 컨설팅', price: 250000 },
        premium: { name: '프리미엄 컨설팅', price: 400000 }
    }
};

// ===== 유틸리티 함수 =====
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateKorean(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
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

// ===== 데이터 로드 =====
function loadAdminData() {
    const saved = localStorage.getItem('yoonspeech_data');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.settings) bookingState.settings = data.settings;
            if (data.timeBlocks) bookingState.timeBlocks = data.timeBlocks;
            if (data.reservations) bookingState.reservations = data.reservations;
        } catch (e) {
            console.error('데이터 로드 실패:', e);
        }
    }
}

function saveReservation(reservation) {
    const saved = localStorage.getItem('yoonspeech_data');
    let data = {};
    if (saved) {
        try {
            data = JSON.parse(saved);
        } catch (e) {
            console.error('데이터 파싱 실패:', e);
        }
    }

    if (!data.reservations) data.reservations = [];
    data.reservations.push(reservation);

    // 해당 시간 블록을 booked로 변경
    if (!data.timeBlocks) data.timeBlocks = {};
    if (!data.timeBlocks[reservation.date]) data.timeBlocks[reservation.date] = {};
    data.timeBlocks[reservation.date][reservation.time] = 'booked';

    localStorage.setItem('yoonspeech_data', JSON.stringify(data));

    // 상태 업데이트
    bookingState.reservations = data.reservations;
    bookingState.timeBlocks = data.timeBlocks;
}

// ===== 날짜 관련 함수 =====
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
        .filter(([time, status]) => status === 'available')
        .map(([time]) => time)
        .sort();
}

// ===== 캘린더 렌더링 =====
function renderCalendar() {
    const year = bookingState.currentDate.getFullYear();
    const month = bookingState.currentDate.getMonth();

    // 월 표시 업데이트
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
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day empty disabled';
        dayElement.innerHTML = `<span class="day-number">${prevMonthDays - i}</span>`;
        calendarDays.appendChild(dayElement);
    }

    // 현재 달 날짜
    for (let day = 1; day <= totalDays; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';

        const currentDate = new Date(year, month, day);
        const dateStr = formatDate(currentDate);
        const dayOfWeek = currentDate.getDay();

        // 과거 날짜 비활성화
        const isPast = currentDate < today;
        if (isPast) {
            dayElement.classList.add('disabled');
        }

        // 운영 요일 체크
        const isOperating = isOperatingDay(dayOfWeek);
        const hasAvailableSlots = isDateAvailable(dateStr);

        let statusHtml = '';

        if (!isOperating || isPast) {
            dayElement.classList.add('non-operating');
        } else if (hasAvailableSlots) {
            dayElement.classList.add('operating', 'has-available');
            statusHtml = '<span class="day-status available">예약 가능</span>';
        } else {
            dayElement.classList.add('operating');
            statusHtml = '<span class="day-status closed">마감</span>';
        }

        // 선택된 날짜
        if (bookingState.selectedDate === dateStr) {
            dayElement.classList.add('selected');
        }

        // 오늘 표시
        if (currentDate.getTime() === today.getTime()) {
            dayElement.classList.add('today');
        }

        dayElement.innerHTML = `
            <span class="day-number">${day}</span>
            ${statusHtml}
        `;

        // 클릭 이벤트 (예약 가능한 날짜만)
        if (!isPast && isOperating && hasAvailableSlots) {
            dayElement.addEventListener('click', () => selectDate(dateStr));
            dayElement.style.cursor = 'pointer';
        }

        calendarDays.appendChild(dayElement);
    }

    // 다음 달 빈 칸
    const remainingDays = 42 - (startingDay + totalDays);
    for (let i = 1; i <= remainingDays; i++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day empty disabled';
        dayElement.innerHTML = `<span class="day-number">${i}</span>`;
        calendarDays.appendChild(dayElement);
    }
}

function selectDate(dateStr) {
    bookingState.selectedDate = dateStr;
    renderCalendar();

    // 시간 선택 단계로 이동
    goToStep(2);
}

// ===== 시간 슬롯 렌더링 =====
function renderTimeSlots() {
    const container = document.getElementById('timeSlots');
    const dateDisplay = document.getElementById('selectedDateDisplay');

    if (!bookingState.selectedDate) {
        container.innerHTML = '<p class="empty-state">날짜를 먼저 선택해주세요</p>';
        return;
    }

    dateDisplay.textContent = formatDateKorean(bookingState.selectedDate);

    const availableSlots = getAvailableTimeSlots(bookingState.selectedDate);

    if (availableSlots.length === 0) {
        container.innerHTML = '<p class="empty-state">예약 가능한 시간이 없습니다</p>';
        return;
    }

    container.innerHTML = availableSlots.map(time => {
        const isSelected = bookingState.selectedTime === time;
        return `
            <div class="time-slot ${isSelected ? 'selected' : ''}" data-time="${time}">
                <span class="time-value">${time}</span>
                <span class="time-duration">90분 진행</span>
            </div>
        `;
    }).join('');

    // 시간 슬롯 클릭 이벤트
    container.querySelectorAll('.time-slot').forEach(slot => {
        slot.addEventListener('click', () => selectTime(slot.dataset.time));
    });
}

function selectTime(time) {
    bookingState.selectedTime = time;
    renderTimeSlots();

    // 정보 입력 단계로 이동
    goToStep(3);
}

// ===== 스텝 관리 =====
function goToStep(step) {
    bookingState.currentStep = step;

    // 모든 스텝 숨기기
    document.querySelectorAll('.booking-step').forEach(s => {
        s.style.display = 'none';
    });

    // 현재 스텝 표시
    document.getElementById(`step${step}`).style.display = 'block';

    // 스텝 인디케이터 업데이트
    document.querySelectorAll('.step-indicator .step').forEach(s => {
        const stepNum = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (stepNum < step) {
            s.classList.add('completed');
        } else if (stepNum === step) {
            s.classList.add('active');
        }
    });

    // 스텝별 렌더링
    if (step === 2) {
        renderTimeSlots();
    } else if (step === 3) {
        updateBookingDisplay();
    }

    // 스크롤 맨 위로
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateBookingDisplay() {
    const display = document.getElementById('bookingDateTimeDisplay');
    if (bookingState.selectedDate && bookingState.selectedTime) {
        display.textContent = `${formatDateKorean(bookingState.selectedDate)} ${bookingState.selectedTime}`;
    }
}

// ===== 예약 폼 제출 =====
function handleBookingSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);

    const customerName = formData.get('customerName').trim();
    const customerPhone = formData.get('customerPhone').trim();
    const customerEmail = formData.get('customerEmail').trim();
    const customerMemo = formData.get('customerMemo').trim();
    const courseType = formData.get('course');

    // 유효성 검사
    if (!customerName) {
        showToast('이름을 입력해주세요');
        return;
    }

    if (!customerPhone) {
        showToast('연락처를 입력해주세요');
        return;
    }

    // 전화번호 형식 검사
    const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
    if (!phoneRegex.test(customerPhone.replace(/-/g, ''))) {
        showToast('올바른 연락처를 입력해주세요');
        return;
    }

    // 예약 데이터 생성
    const bookingId = generateBookingId();
    const course = bookingState.courses[courseType];

    const reservation = {
        id: bookingId,
        date: bookingState.selectedDate,
        time: bookingState.selectedTime,
        course: courseType,
        courseName: course.name,
        price: course.price,
        customerName,
        customerPhone,
        customerEmail,
        customerMemo,
        status: 'pending', // pending, confirmed, cancelled
        createdAt: new Date().toISOString()
    };

    // 저장
    saveReservation(reservation);

    // 완료 화면 표시
    showCompletionStep(reservation);
}

function showCompletionStep(reservation) {
    document.getElementById('summaryId').textContent = reservation.id;
    document.getElementById('summaryDateTime').textContent =
        `${formatDateKorean(reservation.date)} ${reservation.time}`;
    document.getElementById('summaryCourse').textContent = reservation.courseName;
    document.getElementById('summaryName').textContent = reservation.customerName;
    document.getElementById('summaryPhone').textContent = reservation.customerPhone;
    document.getElementById('summaryPrice').textContent = formatPrice(reservation.price);

    goToStep(4);
}

// ===== 초기화 =====
function init() {
    // 데이터 로드
    loadAdminData();

    // 캘린더 렌더링
    renderCalendar();

    // 월 이동 버튼
    document.getElementById('prevMonth').addEventListener('click', () => {
        bookingState.currentDate.setMonth(bookingState.currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        bookingState.currentDate.setMonth(bookingState.currentDate.getMonth() + 1);
        renderCalendar();
    });

    // 뒤로 가기 버튼
    document.getElementById('backToStep1').addEventListener('click', () => {
        bookingState.selectedTime = null;
        goToStep(1);
    });

    document.getElementById('backToStep2').addEventListener('click', () => {
        goToStep(2);
    });

    // 예약 폼 제출
    document.getElementById('bookingForm').addEventListener('submit', handleBookingSubmit);
}

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', init);
