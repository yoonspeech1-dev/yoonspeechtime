// ===== 윤스피치 예약 관리 시스템 =====

// 상태 관리
const state = {
    currentDate: new Date(),
    selectedDate: null,
    selectedDates: [], // 다중 선택 모드용
    multiSelectMode: false,
    editMode: false,
    duration: 90, // 진행 시간 (분)
    // 드래그 선택 관련
    isDragging: false,
    dragStartTime: null,
    dragMode: null, // 'available' 또는 'unavailable'
    dragSelectedTimes: [],
    // 기본 설정 (설정 탭에서 관리)
    settings: {
        weekdays: [1, 2, 3, 4, 5], // 월~금 (0=일, 6=토)
        startTime: '09:00',
        endTime: '18:00',
        interval: 60
    },
    // 타임 블록 데이터: { 'YYYY-MM-DD': { '10:00': 'available' | 'unavailable' | 'booked' } }
    // 기본값은 빈 객체 (모두 잠금 상태)
    timeBlocks: {},
    reservations: []
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
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} (${days[date.getDay()]})`;
}

function formatDateShort(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function generateTimeSlots(startTime, endTime, interval) {
    const slots = [];
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    let currentHour = startHour;
    let currentMin = startMin;

    while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
        slots.push(`${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`);
        currentMin += interval;
        if (currentMin >= 60) {
            currentHour += Math.floor(currentMin / 60);
            currentMin = currentMin % 60;
        }
    }
    return slots;
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

function generateUniqueId() {
    return Math.random().toString(36).substring(2, 8);
}

// ===== 서버 데이터 로드/저장 =====
async function loadFromServer() {
    try {
        const res = await fetch('/api/get-data');
        if (!res.ok) throw new Error('서버 응답 오류');
        const data = await res.json();
        if (data.settings) state.settings = data.settings;
        if (data.timeBlocks) state.timeBlocks = data.timeBlocks;
        if (data.reservations) state.reservations = data.reservations;
    } catch (e) {
        console.error('서버 데이터 로드 실패:', e);
        showToast('데이터를 불러오는데 실패했습니다');
    }
}

async function saveSettingsToServer() {
    try {
        const res = await fetch('/api/save-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: state.settings }),
        });
        if (!res.ok) throw new Error('저장 실패');
    } catch (e) {
        console.error('설정 저장 실패:', e);
        showToast('설정 저장에 실패했습니다');
    }
}

async function saveTimeBlocksToServer() {
    try {
        const res = await fetch('/api/save-time-blocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeBlocks: state.timeBlocks }),
        });
        if (!res.ok) throw new Error('저장 실패');
    } catch (e) {
        console.error('타임블록 저장 실패:', e);
        showToast('타임블록 저장에 실패했습니다');
    }
}

async function updateReservationOnServer(action, reservationId, schedules) {
    try {
        const res = await fetch('/api/update-reservation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, reservationId, schedules }),
        });
        if (!res.ok) throw new Error('업데이트 실패');
        const data = await res.json();
        if (data.timeBlocks) state.timeBlocks = data.timeBlocks;
    } catch (e) {
        console.error('예약 업데이트 실패:', e);
        showToast('예약 업데이트에 실패했습니다');
    }
}

// ===== 설정을 UI에 반영 =====
function applySettingsToUI() {
    // 설정 탭 UI 업데이트
    document.getElementById('defaultStart').value = state.settings.startTime;
    document.getElementById('defaultEnd').value = state.settings.endTime;

    // 요일 버튼 업데이트
    document.querySelectorAll('.weekday-btn').forEach(btn => {
        const day = parseInt(btn.dataset.day);
        if (state.settings.weekdays.includes(day)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 일정관리 탭 시간 설정 업데이트
    document.getElementById('startTime').value = state.settings.startTime;
    document.getElementById('endTime').value = state.settings.endTime;
    document.getElementById('interval').value = state.settings.interval;
}

// ===== 날짜 예약 가능 여부 확인 =====
function isDateAvailable(dateStr) {
    const blocks = state.timeBlocks[dateStr];
    if (!blocks) return false;

    const values = Object.values(blocks);
    return values.includes('available');
}

function isOperatingDay(dayOfWeek) {
    return state.settings.weekdays.includes(dayOfWeek);
}

// ===== 캘린더 렌더링 =====
function renderCalendar() {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();

    // 년/월 선택기 업데이트
    updateDateSelectors(year, month);

    // 캘린더 날짜 생성
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
        dayElement.className = 'calendar-day empty disabled non-operating';
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

        // 오늘 날짜
        const isToday = currentDate.getTime() === today.getTime();
        if (isToday) {
            dayElement.classList.add('today');
        }

        // 과거 날짜 비활성화
        const isPast = currentDate < today;
        if (isPast) {
            dayElement.classList.add('disabled');
        }

        // 선택된 날짜
        const isSelected = state.multiSelectMode
            ? state.selectedDates.includes(dateStr)
            : state.selectedDate === dateStr;
        if (isSelected) {
            dayElement.classList.add('selected');
        }

        // 운영 요일 체크
        const isOperating = isOperatingDay(dayOfWeek);
        const hasAvailableSlots = isDateAvailable(dateStr);

        // 상태 라벨 결정
        let statusHtml = '';

        if (!isOperating) {
            // 비운영 요일 (일/토 등)
            dayElement.classList.add('non-operating');
        } else {
            // 운영 요일
            dayElement.classList.add('operating');

            if (!isPast) {
                if (hasAvailableSlots) {
                    dayElement.classList.add('has-available');
                    statusHtml = '<span class="day-status available">예약 가능</span>';
                } else {
                    statusHtml = '<span class="day-status closed">마감</span>';
                }
            }
        }

        // HTML 구조: 동그라미 안에 숫자 + 상태 라벨
        dayElement.innerHTML = `
            <span class="day-number">${day}</span>
            ${statusHtml}
        `;

        // 클릭 이벤트 (관리자는 모든 날짜 클릭 가능)
        if (!dayElement.classList.contains('disabled')) {
            dayElement.addEventListener('click', () => handleDateClick(dateStr));
            dayElement.style.cursor = 'pointer';
        }

        calendarDays.appendChild(dayElement);
    }

    // 다음 달 빈 칸
    const remainingDays = 42 - (startingDay + totalDays);
    for (let i = 1; i <= remainingDays; i++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day empty disabled non-operating';
        dayElement.innerHTML = `<span class="day-number">${i}</span>`;
        calendarDays.appendChild(dayElement);
    }
}

// 예약된 시간이 있는지 확인
function hasBookedTime(dateStr) {
    const blocks = state.timeBlocks[dateStr];
    if (!blocks) return false;
    return Object.values(blocks).includes('booked');
}

function updateDateSelectors(year, month) {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');

    // 년도 옵션
    yearSelect.innerHTML = '';
    for (let y = 2024; y <= 2030; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = `${y}년`;
        if (y === year) option.selected = true;
        yearSelect.appendChild(option);
    }

    // 월 옵션
    monthSelect.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
        const option = document.createElement('option');
        option.value = m - 1;
        option.textContent = `${m}월`;
        if (m - 1 === month) option.selected = true;
        monthSelect.appendChild(option);
    }
}

function getDateDots(dateStr) {
    const blocks = state.timeBlocks[dateStr];
    if (!blocks) return [];

    const dots = [];
    const values = Object.values(blocks);

    if (values.includes('available')) dots.push('available');
    if (values.includes('booked')) dots.push('booked');

    return dots.slice(0, 3); // 최대 3개
}

// ===== 날짜 클릭 처리 =====
function handleDateClick(dateStr) {
    if (state.multiSelectMode) {
        const index = state.selectedDates.indexOf(dateStr);
        if (index > -1) {
            state.selectedDates.splice(index, 1);
        } else {
            state.selectedDates.push(dateStr);
            state.selectedDates.sort();
        }
    } else {
        state.selectedDate = dateStr;
        state.selectedDates = [dateStr];
    }

    renderCalendar();
    updateSelectedDateText();
    renderTimeBlocks();
}

function updateSelectedDateText() {
    const textEl = document.getElementById('selectedDateText');
    const panelDateEl = document.getElementById('timePanelDate');

    if (state.multiSelectMode && state.selectedDates.length > 1) {
        textEl.textContent = `${state.selectedDates.length}개 날짜 선택됨`;
        panelDateEl.textContent = `${state.selectedDates.length}개 날짜 선택됨`;
    } else if (state.selectedDate) {
        textEl.textContent = formatDateKorean(state.selectedDate);
        panelDateEl.textContent = formatDateKorean(state.selectedDate);
    } else {
        textEl.textContent = '-';
        panelDateEl.textContent = '날짜를 선택하세요';
    }
}

// ===== 타임 블록 렌더링 =====
function renderTimeBlocks() {
    const container = document.getElementById('timeBlocks');

    if (!state.selectedDate && state.selectedDates.length === 0) {
        container.innerHTML = '<p class="empty-state">캘린더에서 날짜를 선택해주세요</p>';
        return;
    }

    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const interval = parseInt(document.getElementById('interval').value);

    const slots = generateTimeSlots(startTime, endTime, interval);

    if (slots.length === 0) {
        container.innerHTML = '<p class="empty-state">시간 설정을 확인해주세요</p>';
        return;
    }

    // 단일 날짜 또는 다중 날짜 처리
    const targetDates = state.multiSelectMode ? state.selectedDates : [state.selectedDate];

    container.innerHTML = slots.map(time => {
        let status = 'unavailable'; // 기본값은 항상 잠금

        if (targetDates.length === 1) {
            const dateStr = targetDates[0];
            if (state.timeBlocks[dateStr] && state.timeBlocks[dateStr][time]) {
                status = state.timeBlocks[dateStr][time];
            }
        } else {
            // 다중 선택: 모든 날짜에서 같은 상태면 그 상태, 아니면 unavailable
            const statuses = targetDates.map(dateStr => {
                if (state.timeBlocks[dateStr] && state.timeBlocks[dateStr][time]) {
                    return state.timeBlocks[dateStr][time];
                }
                return 'unavailable';
            });

            const allSame = statuses.every(s => s === statuses[0]);
            if (allSame) status = statuses[0];
        }

        return `<div class="time-block ${status}" data-time="${time}">${time}</div>`;
    }).join('');

    // 타임 블록 드래그 선택 이벤트
    container.querySelectorAll('.time-block').forEach(block => {
        const time = block.dataset.time;

        // 마우스 이벤트
        block.addEventListener('mousedown', (e) => {
            e.preventDefault();
            handleDragStart(time, block);
        });

        block.addEventListener('mouseenter', () => {
            if (state.isDragging) {
                handleDragMove(time, block);
            }
        });

        // 터치 이벤트 (모바일)
        block.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handleDragStart(time, block);
        }, { passive: false });

        block.addEventListener('touchmove', (e) => {
            if (state.isDragging) {
                const touch = e.touches[0];
                const element = document.elementFromPoint(touch.clientX, touch.clientY);
                if (element && element.classList.contains('time-block')) {
                    handleDragMove(element.dataset.time, element);
                }
            }
        }, { passive: false });
    });
}

// ===== 드래그 선택 처리 =====
function handleDragStart(time, block) {
    // 예약 완료 상태는 드래그 불가
    if (block.classList.contains('booked')) return;

    state.isDragging = true;
    state.dragStartTime = time;
    state.dragSelectedTimes = [time];

    // 드래그 모드 결정: 현재 상태의 반대로 설정
    const currentStatus = block.classList.contains('available') ? 'available' : 'unavailable';
    state.dragMode = currentStatus === 'available' ? 'unavailable' : 'available';

    // 시각적 표시
    block.classList.add('drag-selected');
    document.getElementById('timeBlocks').classList.add('dragging');
}

function handleDragMove(time, block) {
    if (!state.isDragging) return;

    // 예약 완료 상태는 건너뜀
    if (block.classList.contains('booked')) return;

    // 이미 선택된 시간이면 건너뜀
    if (state.dragSelectedTimes.includes(time)) return;

    // 선택 목록에 추가
    state.dragSelectedTimes.push(time);

    // 시각적 표시
    block.classList.add('drag-selected');
}

function handleDragEnd() {
    if (!state.isDragging) return;

    const targetDates = state.multiSelectMode ? state.selectedDates : [state.selectedDate];
    if (targetDates.length === 0 || !targetDates[0]) {
        resetDragState();
        return;
    }

    // 선택된 시간들의 상태 변경
    targetDates.forEach(dateStr => {
        if (!state.timeBlocks[dateStr]) {
            state.timeBlocks[dateStr] = {};
        }

        state.dragSelectedTimes.forEach(time => {
            const currentStatus = state.timeBlocks[dateStr][time] || 'unavailable';
            if (currentStatus !== 'booked') {
                state.timeBlocks[dateStr][time] = state.dragMode;
            }
        });
    });

    const count = state.dragSelectedTimes.length;
    const action = state.dragMode === 'available' ? '열림' : '닫힘';

    resetDragState();
    renderTimeBlocks();
    renderCalendar();
    saveTimeBlocksToServer();

    if (count > 0) {
        showToast(`${count}개 시간이 ${action}으로 변경되었습니다`);
    }
}

function resetDragState() {
    state.isDragging = false;
    state.dragStartTime = null;
    state.dragMode = null;
    state.dragSelectedTimes = [];

    // 드래그 선택 표시 제거
    document.querySelectorAll('.time-block.drag-selected').forEach(block => {
        block.classList.remove('drag-selected');
    });

    // 컨테이너 드래그 클래스 제거
    const container = document.getElementById('timeBlocks');
    if (container) {
        container.classList.remove('dragging');
    }
}

// 전역 마우스/터치 종료 이벤트
document.addEventListener('mouseup', handleDragEnd);
document.addEventListener('touchend', handleDragEnd);

// ===== 타임 블록 클릭 처리 (단일 클릭 시) =====
function handleTimeBlockClick(time) {
    const targetDates = state.multiSelectMode ? state.selectedDates : [state.selectedDate];
    if (targetDates.length === 0 || !targetDates[0]) return;

    targetDates.forEach(dateStr => {
        if (!state.timeBlocks[dateStr]) {
            state.timeBlocks[dateStr] = {};
        }

        const currentStatus = state.timeBlocks[dateStr][time] || 'unavailable';

        // 예약 완료 상태는 변경 불가
        if (currentStatus === 'booked') return;

        // 상태 토글
        state.timeBlocks[dateStr][time] = currentStatus === 'available' ? 'unavailable' : 'available';
    });

    renderTimeBlocks();
    renderCalendar();
    saveTimeBlocksToServer();
    showToast(`${time} 시간이 변경되었습니다`);
}

// ===== 일괄 열기/마감 =====
function bulkOpenTimeBlocks() {
    const targetDates = state.multiSelectMode ? state.selectedDates : [state.selectedDate];
    if (targetDates.length === 0 || !targetDates[0]) {
        showToast('날짜를 먼저 선택해주세요');
        return;
    }

    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const interval = parseInt(document.getElementById('interval').value);
    const slots = generateTimeSlots(startTime, endTime, interval);

    targetDates.forEach(dateStr => {
        if (!state.timeBlocks[dateStr]) {
            state.timeBlocks[dateStr] = {};
        }
        slots.forEach(time => {
            if (state.timeBlocks[dateStr][time] !== 'booked') {
                state.timeBlocks[dateStr][time] = 'available';
            }
        });
    });

    renderTimeBlocks();
    renderCalendar();
    saveTimeBlocksToServer();
    showToast(`${targetDates.length}개 날짜에 시간이 열렸습니다`);
}

function closeAllTimeBlocks() {
    const targetDates = state.multiSelectMode ? state.selectedDates : [state.selectedDate];
    if (targetDates.length === 0 || !targetDates[0]) {
        showToast('날짜를 먼저 선택해주세요');
        return;
    }

    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const interval = parseInt(document.getElementById('interval').value);
    const slots = generateTimeSlots(startTime, endTime, interval);

    targetDates.forEach(dateStr => {
        if (!state.timeBlocks[dateStr]) {
            state.timeBlocks[dateStr] = {};
        }
        slots.forEach(time => {
            if (state.timeBlocks[dateStr][time] !== 'booked') {
                state.timeBlocks[dateStr][time] = 'unavailable';
            }
        });
    });

    renderTimeBlocks();
    renderCalendar();
    saveTimeBlocksToServer();
    showToast('마감 설정되었습니다');
}

function openAllTimeBlocks() {
    const targetDates = state.multiSelectMode ? state.selectedDates : [state.selectedDate];
    if (targetDates.length === 0 || !targetDates[0]) {
        showToast('날짜를 먼저 선택해주세요');
        return;
    }

    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const interval = parseInt(document.getElementById('interval').value);
    const slots = generateTimeSlots(startTime, endTime, interval);

    targetDates.forEach(dateStr => {
        if (!state.timeBlocks[dateStr]) {
            state.timeBlocks[dateStr] = {};
        }
        slots.forEach(time => {
            if (state.timeBlocks[dateStr][time] !== 'booked') {
                state.timeBlocks[dateStr][time] = 'available';
            }
        });
    });

    renderTimeBlocks();
    renderCalendar();
    saveTimeBlocksToServer();
    showToast('마감 해제되었습니다');
}

// ===== 설정 저장 =====
function saveSettings() {
    // 운영 요일 수집
    const weekdays = [];
    document.querySelectorAll('.weekday-btn.active').forEach(btn => {
        weekdays.push(parseInt(btn.dataset.day));
    });

    // 시간 설정 수집
    const startTime = document.getElementById('defaultStart').value;
    const endTime = document.getElementById('defaultEnd').value;

    if (weekdays.length === 0) {
        showToast('최소 하나의 운영 요일을 선택해주세요');
        return;
    }

    if (startTime >= endTime) {
        showToast('종료 시간이 시작 시간보다 늦어야 합니다');
        return;
    }

    // state 업데이트
    state.settings.weekdays = weekdays;
    state.settings.startTime = startTime;
    state.settings.endTime = endTime;

    // 일정관리 탭에도 반영
    document.getElementById('startTime').value = startTime;
    document.getElementById('endTime').value = endTime;

    // 서버 저장
    saveSettingsToServer();

    // 현재 타임 블록 다시 렌더링
    if (state.selectedDate) {
        renderTimeBlocks();
    }

    showToast('설정이 저장되었습니다');
}

// ===== 탭 전환 =====
function setupTabs() {
    const tabButtons = document.querySelectorAll('.main-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });

            // 일정관리 탭 전환 시 설정값 반영
            if (targetTab === 'schedule') {
                document.getElementById('startTime').value = state.settings.startTime;
                document.getElementById('endTime').value = state.settings.endTime;
                if (state.selectedDate) {
                    renderTimeBlocks();
                }
            }
        });
    });
}

// ===== 이벤트 리스너 설정 =====
function setupEventListeners() {
    // 이전/다음 달
    document.getElementById('prevMonth').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() + 1);
        renderCalendar();
    });

    // 년/월 선택
    document.getElementById('yearSelect').addEventListener('change', (e) => {
        state.currentDate.setFullYear(parseInt(e.target.value));
        renderCalendar();
    });

    document.getElementById('monthSelect').addEventListener('change', (e) => {
        state.currentDate.setMonth(parseInt(e.target.value));
        renderCalendar();
    });

    // 오늘로 이동
    document.getElementById('goToday').addEventListener('click', () => {
        state.currentDate = new Date();
        state.selectedDate = formatDate(new Date());
        state.selectedDates = [state.selectedDate];
        renderCalendar();
        updateSelectedDateText();
        renderTimeBlocks();
    });

    // 다중 선택 모드
    document.getElementById('multiDateMode').addEventListener('change', (e) => {
        state.multiSelectMode = e.target.checked;
        if (!state.multiSelectMode) {
            state.selectedDates = state.selectedDate ? [state.selectedDate] : [];
        }
        renderCalendar();
        updateSelectedDateText();
    });

    // 진행 시간 버튼
    document.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.duration = parseInt(btn.dataset.duration);
        });
    });

    // 일괄 열기
    document.getElementById('bulkOpenBtn').addEventListener('click', bulkOpenTimeBlocks);

    // 마감 설정/해제
    document.getElementById('closeAllBtn').addEventListener('click', closeAllTimeBlocks);
    document.getElementById('openAllBtn').addEventListener('click', openAllTimeBlocks);

    // 시간 설정 변경 시 타임 블록 다시 렌더링
    ['startTime', 'endTime', 'interval'].forEach(id => {
        document.getElementById(id).addEventListener('change', renderTimeBlocks);
    });

    // URL 생성
    document.getElementById('generateUrl').addEventListener('click', () => {
        const uniqueId = generateUniqueId();
        const url = `${window.location.origin}/booking/${uniqueId}`;

        document.getElementById('generatedUrl').value = url;
        document.getElementById('urlResult').style.display = 'flex';
        showToast('예약 URL이 생성되었습니다');
    });

    // URL 복사
    document.getElementById('copyUrl').addEventListener('click', () => {
        const urlInput = document.getElementById('generatedUrl');
        urlInput.select();
        document.execCommand('copy');
        showToast('URL이 복사되었습니다');
    });

    // 예약 필터
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderReservations(btn.dataset.filter);
        });
    });

    // 예약 검색
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
        renderReservations(activeFilter, e.target.value);
    });

    // 요일 버튼 토글
    document.querySelectorAll('.weekday-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
        });
    });

    // 설정 저장
    document.getElementById('saveSettings').addEventListener('click', saveSettings);

    // 예약 상세보기 모달 닫기
    document.getElementById('detailModalClose').addEventListener('click', closeReservationDetail);
    document.getElementById('detailModalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeReservationDetail();
    });

    // 일정 수정 모달 이벤트
    document.getElementById('editScheduleModalClose').addEventListener('click', closeEditScheduleModal);
    document.getElementById('editScheduleCancelBtn').addEventListener('click', closeEditScheduleModal);
    document.getElementById('editScheduleSaveBtn').addEventListener('click', saveEditedSchedules);
    document.getElementById('editScheduleModalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeEditScheduleModal();
    });

    // 링크 관리 날짜 기본값
    const today = new Date();
    document.getElementById('linkStartDate').value = formatDate(today);
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    document.getElementById('linkEndDate').value = formatDate(nextMonth);
}

// ===== 예약 목록 렌더링 =====
function renderReservations(filter = 'all', searchTerm = '') {
    const container = document.getElementById('reservationList');

    let filteredReservations = [...state.reservations];

    if (filter !== 'all') {
        filteredReservations = filteredReservations.filter(r => r.status === filter);
    }

    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredReservations = filteredReservations.filter(r => {
            const name = (r.customerName || r.name || '').toLowerCase();
            const phone = r.customerPhone || r.phone || '';
            return name.includes(term) || phone.includes(term);
        });
    }

    // 입금대기 개수 업데이트
    const pendingCount = state.reservations.filter(r => r.status === 'pending').length;
    const badge = document.getElementById('pendingBadge');
    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }

    if (filteredReservations.length === 0) {
        container.innerHTML = '<p class="empty-state">예약 신청이 없습니다.</p>';
        return;
    }

    container.innerHTML = filteredReservations.map(reservation => {
        const name = reservation.customerName || reservation.name || '-';
        const phone = reservation.customerPhone || reservation.phone || '-';
        const courseName = reservation.courseName || reservation.course || '-';
        const schedules = reservation.schedules || reservation.dates || [];
        const price = reservation.price ? (reservation.price).toLocaleString('ko-KR') + '원' : '-';

        return `
            <div class="reservation-item clickable ${reservation.status === 'confirmed' ? 'confirmed' : ''}" data-id="${reservation.id}">
                <div class="reservation-item-header">
                    <span class="reservation-name">${name}</span>
                    <span class="reservation-status ${reservation.status}">
                        ${reservation.status === 'pending' ? '입금대기' : '예약확정'}
                    </span>
                </div>
                <div class="reservation-info">
                    <span>${phone}</span>
                    <span>${courseName}</span>
                    <span>${price}</span>
                </div>
                <div class="reservation-schedules">
                    ${schedules.map((s, i) => `<span class="schedule-chip">${i + 1}회 ${formatDateShort(s.date)} ${s.time}</span>`).join('')}
                </div>
                ${reservation.status === 'pending' ? `
                    <div class="reservation-actions">
                        <button class="confirm-btn" onclick="event.stopPropagation(); confirmReservation('${reservation.id}')">예약 확정</button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // 예약 아이템 클릭 시 상세보기 모달 열기
    container.querySelectorAll('.reservation-item.clickable').forEach(item => {
        item.addEventListener('click', () => {
            showReservationDetail(item.dataset.id);
        });
    });
}

// 예약 시간 기준으로 블록해야 할 슬롯 목록 반환 (컨설팅 90분 + 준비 30분 = 120분)
function getBlockedSlots(bookedTime) {
    const BLOCK_MINUTES = 120;
    const [h, m] = bookedTime.split(':').map(Number);
    const startMin = h * 60 + m;
    const interval = state.settings.interval || 60;
    const slots = [];

    // 예약 시간 자체 + 이후 120분 이내의 슬롯들
    for (let min = startMin; min < startMin + BLOCK_MINUTES; min += interval) {
        const slotH = Math.floor(min / 60);
        const slotM = min % 60;
        slots.push(`${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`);
    }
    return slots;
}

// 예약 확정
async function confirmReservation(reservationId) {
    const reservation = state.reservations.find(r => r.id === reservationId);
    if (reservation) {
        reservation.status = 'confirmed';

        // 해당 타임 블록들을 예약 완료로 변경 (2시간 블록 적용) - 로컬 상태도 업데이트
        const schedules = reservation.schedules || reservation.dates || [];
        schedules.forEach(({ date, time }) => {
            if (!state.timeBlocks[date]) {
                state.timeBlocks[date] = {};
            }
            const blockedSlots = getBlockedSlots(time);
            blockedSlots.forEach(slot => {
                state.timeBlocks[date][slot] = 'booked';
            });
        });

        await updateReservationOnServer('confirm', reservationId);
        renderReservations();
        renderCalendar();
        renderTimeBlocks();

        const name = reservation.customerName || reservation.name || '';
        showToast(`${name}님의 예약이 확정되었습니다`);

        // 문자 발송 (부가 기능 - 실패해도 예약 확정은 유지)
        sendConfirmationSMS(reservation);
    }
}

async function sendConfirmationSMS(reservation) {
    try {
        const res = await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservation }),
        });
        const data = await res.json();
        if (res.ok) {
            if (data.errors && data.errors.length > 0) {
                showToast('일부 문자 발송에 실패했습니다');
            } else {
                showToast('문자가 발송되었습니다 (고객/관리자/직원)');
            }
        } else {
            showToast('예약은 확정되었으나 문자 발송에 실패했습니다');
        }
    } catch (e) {
        console.error('SMS 발송 요청 실패:', e);
        showToast('예약은 확정되었으나 문자 발송에 실패했습니다');
    }
}

window.confirmReservation = confirmReservation;

// ===== 예약 상세보기 =====
function showReservationDetail(reservationId) {
    const reservation = state.reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    // 기본 정보
    document.getElementById('detailName').textContent = reservation.customerName || reservation.name || '-';
    document.getElementById('detailAge').textContent = reservation.customerAge || '-';
    document.getElementById('detailPhone').textContent = reservation.customerPhone || reservation.phone || '-';
    document.getElementById('detailEmail').textContent = reservation.customerEmail || '-';

    // 현금영수증
    document.getElementById('detailReceipt').textContent = reservation.receipt ? '발급' : '미발급';
    const receiptNumRow = document.getElementById('detailReceiptNumberRow');
    if (reservation.receipt && reservation.receiptNumber) {
        receiptNumRow.style.display = 'flex';
        document.getElementById('detailReceiptNumber').textContent = reservation.receiptNumber;
    } else {
        receiptNumRow.style.display = 'none';
    }

    // 컨설팅 정보
    document.getElementById('detailCourse').textContent = reservation.courseName || reservation.course || '-';
    document.getElementById('detailPrice').textContent = reservation.price ? reservation.price.toLocaleString('ko-KR') + '원' : '-';

    const schedules = reservation.schedules || reservation.dates || [];
    const schedulesEl = document.getElementById('detailSchedules');
    if (schedules.length > 0) {
        schedulesEl.innerHTML = '<div class="detail-schedule-list">' +
            schedules.map((s, i) => `<span class="detail-schedule-item">${i + 1}회 ${formatDateKorean(s.date)} ${s.time}</span>`).join('') +
            '</div>';
    } else {
        schedulesEl.textContent = '-';
    }

    // 면접 정보
    document.getElementById('detailRegion').textContent = reservation.customerRegion || '-';
    document.getElementById('detailCompany').textContent = reservation.customerCompany || '-';
    document.getElementById('detailPosition').textContent = reservation.customerPosition || '-';
    document.getElementById('detailInterviewDate').textContent = reservation.customerInterviewDate || '-';

    const interviewTypes = reservation.interviewTypes || [];
    const interviewEl = document.getElementById('detailInterviewTypes');
    if (interviewTypes.length > 0) {
        interviewEl.innerHTML = interviewTypes.map(t => `<span class="detail-chip">${t}</span>`).join('');
    } else {
        interviewEl.textContent = '-';
    }

    // 기타 정보
    document.getElementById('detailConsultMethod').textContent = reservation.consultMethod || '-';

    const referrals = reservation.referrals || [];
    const referralsEl = document.getElementById('detailReferrals');
    if (referrals.length > 0) {
        referralsEl.innerHTML = referrals.map(r => `<span class="detail-chip">${r}</span>`).join('');
    } else {
        referralsEl.textContent = '-';
    }

    // 동의 항목
    document.getElementById('detailRefundAgree').textContent = reservation.refundAgree ? '동의' : '미동의';
    document.getElementById('detailPrivacyAgree').textContent = reservation.privacyAgree || '-';

    // 예약 메타
    document.getElementById('detailReservationId').textContent = reservation.id || '-';
    document.getElementById('detailCreatedAt').textContent = reservation.createdAt
        ? new Date(reservation.createdAt).toLocaleString('ko-KR')
        : '-';

    const statusEl = document.getElementById('detailStatus');
    statusEl.innerHTML = reservation.status === 'confirmed'
        ? '<span class="detail-status-badge confirmed">예약확정</span>'
        : '<span class="detail-status-badge pending">입금대기</span>';

    // 하단 버튼
    const footer = document.getElementById('detailModalFooter');
    if (reservation.status === 'pending') {
        footer.innerHTML = `
            <div class="detail-footer-buttons">
                <button class="detail-edit-btn" id="detailEditBtn">일정 수정</button>
                <button class="detail-confirm-btn" id="detailConfirmBtn">예약 확정</button>
                <button class="detail-delete-btn" id="detailDeleteBtn">예약 삭제</button>
            </div>`;
        document.getElementById('detailConfirmBtn').addEventListener('click', () => {
            confirmReservation(reservation.id);
            closeReservationDetail();
        });
    } else {
        footer.innerHTML = `
            <div class="detail-footer-buttons">
                <button class="detail-edit-btn" id="detailEditBtn">일정 수정</button>
                <button class="detail-delete-btn" id="detailDeleteBtn">예약 삭제</button>
            </div>`;
    }

    // 일정 수정 버튼 이벤트
    document.getElementById('detailEditBtn').addEventListener('click', () => {
        openEditScheduleModal(reservation.id);
    });

    // 예약 삭제 버튼 이벤트
    document.getElementById('detailDeleteBtn').addEventListener('click', () => {
        deleteReservation(reservation.id);
    });

    document.getElementById('detailModalOverlay').classList.add('active');
}

function closeReservationDetail() {
    document.getElementById('detailModalOverlay').classList.remove('active');
}

// ===== 예약 삭제 =====
async function deleteReservation(reservationId) {
    const reservation = state.reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    const name = reservation.customerName || reservation.name || '';
    if (!confirm(`${name}님의 예약을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    // 해당 예약의 booked 슬롯을 available로 복원 (로컬 상태)
    const schedules = reservation.schedules || reservation.dates || [];
    schedules.forEach(({ date, time }) => {
        if (state.timeBlocks[date]) {
            const blockedSlots = getBlockedSlots(time);
            blockedSlots.forEach(slot => {
                if (state.timeBlocks[date][slot] === 'booked') {
                    state.timeBlocks[date][slot] = 'available';
                }
            });
        }
    });

    // reservations에서 제거
    state.reservations = state.reservations.filter(r => r.id !== reservationId);

    await updateReservationOnServer('delete', reservationId);
    renderReservations();
    renderCalendar();
    renderTimeBlocks();
    closeReservationDetail();
    showToast(`${name}님의 예약이 삭제되었습니다`);
}

window.deleteReservation = deleteReservation;

// ===== 일정 수정 모달 =====
function openEditScheduleModal(reservationId) {
    const reservation = state.reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    const schedules = reservation.schedules || reservation.dates || [];
    const container = document.getElementById('editScheduleList');

    container.innerHTML = schedules.map((s, i) => `
        <div class="edit-schedule-row" data-index="${i}">
            <span class="edit-schedule-label">${i + 1}회차</span>
            <input type="date" class="edit-date-input" value="${s.date}" data-index="${i}">
            <select class="edit-time-select" data-index="${i}">
                <option value="${s.time}">${s.time}</option>
            </select>
        </div>
    `).join('');

    // 각 날짜 input에 change 이벤트 바인딩
    container.querySelectorAll('.edit-date-input').forEach(input => {
        const idx = parseInt(input.dataset.index);
        const selectEl = container.querySelector(`.edit-time-select[data-index="${idx}"]`);
        const currentTime = schedules[idx].time;

        // 초기 로드: 현재 날짜의 available 시간 옵션 렌더링
        renderEditTimeOptions(input.value, selectEl, currentTime, reservationId);

        input.addEventListener('change', () => {
            renderEditTimeOptions(input.value, selectEl, null, reservationId);
        });
    });

    document.getElementById('editScheduleModal').dataset.reservationId = reservationId;
    document.getElementById('editScheduleModalOverlay').classList.add('active');
}

function renderEditTimeOptions(dateStr, selectEl, currentTime, reservationId) {
    const startTime = state.settings.startTime;
    const endTime = state.settings.endTime;
    const interval = state.settings.interval || 60;
    const slots = generateTimeSlots(startTime, endTime, interval);

    const reservation = state.reservations.find(r => r.id === reservationId);
    const ownSchedules = reservation ? (reservation.schedules || reservation.dates || []) : [];

    selectEl.innerHTML = '';

    slots.forEach(time => {
        const blockStatus = (state.timeBlocks[dateStr] && state.timeBlocks[dateStr][time]) || 'unavailable';

        // 자기 자신의 예약 슬롯이면 선택 가능하게 표시
        const isOwnSlot = ownSchedules.some(s => s.date === dateStr && s.time === time);

        if (blockStatus === 'available' || isOwnSlot) {
            const option = document.createElement('option');
            option.value = time;
            option.textContent = time;
            if (time === currentTime) option.selected = true;
            selectEl.appendChild(option);
        }
    });

    if (selectEl.options.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '선택 가능한 시간 없음';
        selectEl.appendChild(option);
    }
}

async function saveEditedSchedules() {
    const reservationId = document.getElementById('editScheduleModal').dataset.reservationId;
    const reservation = state.reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    const container = document.getElementById('editScheduleList');
    const rows = container.querySelectorAll('.edit-schedule-row');
    const newSchedules = [];

    for (const row of rows) {
        const date = row.querySelector('.edit-date-input').value;
        const time = row.querySelector('.edit-time-select').value;

        if (!date || !time) {
            showToast('날짜와 시간을 모두 선택해주세요');
            return;
        }
        newSchedules.push({ date, time });
    }

    // 기존 booked 슬롯 해제
    const oldSchedules = reservation.schedules || reservation.dates || [];
    oldSchedules.forEach(({ date, time }) => {
        if (state.timeBlocks[date]) {
            const blockedSlots = getBlockedSlots(time);
            blockedSlots.forEach(slot => {
                if (state.timeBlocks[date][slot] === 'booked') {
                    state.timeBlocks[date][slot] = 'available';
                }
            });
        }
    });

    // 새 일정으로 booked 설정 (confirmed 상태인 경우에만)
    if (reservation.status === 'confirmed') {
        newSchedules.forEach(({ date, time }) => {
            if (!state.timeBlocks[date]) {
                state.timeBlocks[date] = {};
            }
            const blockedSlots = getBlockedSlots(time);
            blockedSlots.forEach(slot => {
                state.timeBlocks[date][slot] = 'booked';
            });
        });
    }

    // schedules 업데이트
    reservation.schedules = newSchedules;

    await updateReservationOnServer('edit_schedules', reservationId, newSchedules);
    renderReservations();
    renderCalendar();
    renderTimeBlocks();
    closeEditScheduleModal();
    closeReservationDetail();
    showToast('일정이 수정되었습니다');
}

function closeEditScheduleModal() {
    document.getElementById('editScheduleModalOverlay').classList.remove('active');
}

window.showReservationDetail = showReservationDetail;
window.closeReservationDetail = closeReservationDetail;
window.openEditScheduleModal = openEditScheduleModal;
window.saveEditedSchedules = saveEditedSchedules;
window.closeEditScheduleModal = closeEditScheduleModal;

// ===== 초기화 =====
async function init() {
    // 로딩 표시
    document.body.classList.add('loading');

    // 서버에서 데이터 불러오기
    await loadFromServer();

    setupTabs();
    setupEventListeners();

    // 설정값을 UI에 반영
    applySettingsToUI();

    renderCalendar();
    renderReservations();

    // 로딩 해제
    document.body.classList.remove('loading');
}

document.addEventListener('DOMContentLoaded', init);
