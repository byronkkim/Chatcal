// calendar.js - Google Calendar 관련 기능 처리

class CalendarManager {
  constructor() {
    this.events = [];
    
    // DOM 요소 가져오기
    this.upcomingEventsContainer = document.getElementById('upcomingEvents');
    
    // 이벤트 리스너 등록
    window.addEventListener('userLoggedIn', () => this.loadUpcomingEvents());
    window.addEventListener('userLoggedOut', () => this.clearEvents());
    window.addEventListener('eventCreated', () => this.loadUpcomingEvents());
    window.addEventListener('eventUpdated', () => this.loadUpcomingEvents());
    window.addEventListener('eventDeleted', () => this.loadUpcomingEvents());
  }
  
  // 다가오는 일정 로드
  async loadUpcomingEvents() {
    try {
      showLoading();
      
      const response = await fetch('/api/calendar/events', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getToken()}`
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('일정을 불러오는 중 오류가 발생했습니다');
      }
      
      this.events = await response.json();
      this.renderEvents();
      
      hideLoading();
    } catch (error) {
      console.error('일정 로드 오류:', error);
      hideLoading();
      
      // 사용자에게 오류 메시지 표시
      this.upcomingEventsContainer.innerHTML = `
        <div class="loading-events">
          일정을 불러오는 중 오류가 발생했습니다.
        </div>
      `;
    }
  }
  
  // 일정 렌더링
  renderEvents() {
    if (!this.events || this.events.length === 0) {
      this.upcomingEventsContainer.innerHTML = `
        <div class="loading-events">
          예정된 일정이 없습니다.
        </div>
      `;
      return;
    }
    
    this.upcomingEventsContainer.innerHTML = '';
    
    this.events.slice(0, 5).forEach(event => {
      const startDate = new Date(event.start.dateTime || event.start.date);
      const endDate = new Date(event.end.dateTime || event.end.date);
      
      const eventElement = document.createElement('div');
      eventElement.className = 'event-card';
      eventElement.innerHTML = `
        <div class="event-title">${event.summary}</div>
        <div class="event-time">
          <i class="far fa-clock"></i>
          <span>${this.formatEventTime(startDate, endDate)}</span>
        </div>
        ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
      `;
      
      this.upcomingEventsContainer.appendChild(eventElement);
    });
  }
  
  // 일정 시간 포맷팅
  formatEventTime(start, end) {
    const options = { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit'
    };
    
    const startStr = start.toLocaleString('ko-KR', options);
    
    // 같은 날짜인 경우 시간만 표시
    if (start.toDateString() === end.toDateString()) {
      return `${startStr} - ${end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return `${startStr} - ${end.toLocaleString('ko-KR', options)}`;
    }
  }
  
  // 일정 생성
  async createEvent(eventData) {
    try {
      showLoading();
      
      const response = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getToken()}`
        },
        credentials: 'include',
        body: JSON.stringify(eventData)
      });
      
      if (!response.ok) {
        throw new Error('일정을 생성하는 중 오류가 발생했습니다');
      }
      
      const result = await response.json();
      
      // 이벤트 발생: 일정 생성 완료
      dispatchEvent(new CustomEvent('eventCreated', { detail: result.event }));
      
      hideLoading();
      return result;
    } catch (error) {
      console.error('일정 생성 오류:', error);
      hideLoading();
      throw error;
    }
  }
  
  // 일정 수정
  async updateEvent(eventId, eventData) {
    try {
      showLoading();
      
      const response = await fetch(`/api/calendar/events/${eventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getToken()}`
        },
        credentials: 'include',
        body: JSON.stringify(eventData)
      });
      
      if (!response.ok) {
        throw new Error('일정을 수정하는 중 오류가 발생했습니다');
      }
      
      const result = await response.json();
      
      // 이벤트 발생: 일정 수정 완료
      dispatchEvent(new CustomEvent('eventUpdated', { detail: result.event }));
      
      hideLoading();
      return result;
    } catch (error) {
      console.error('일정 수정 오류:', error);
      hideLoading();
      throw error;
    }
  }
  
  // 일정 삭제
  async deleteEvent(eventId) {
    try {
      showLoading();
      
      const response = await fetch(`/api/calendar/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getToken()}`
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('일정을 삭제하는 중 오류가 발생했습니다');
      }
      
      const result = await response.json();
      
      // 이벤트 발생: 일정 삭제 완료
      dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId } }));
      
      hideLoading();
      return result;
    } catch (error) {
      console.error('일정 삭제 오류:', error);
      hideLoading();
      throw error;
    }
  }
  
  // 일정 목록 지우기
  clearEvents() {
    this.events = [];
    this.upcomingEventsContainer.innerHTML = `
      <div class="loading-events">
        로그인 후 일정을 불러올 수 있습니다.
      </div>
    `;
  }
}

// 전역 인스턴스 생성
const calendarManager = new CalendarManager(); 