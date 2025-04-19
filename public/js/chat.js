// chat.js - 채팅 인터페이스 및 메시지 처리 기능

class ChatManager {
  constructor() {
    this.messagesContainer = document.getElementById('chatMessages');
    this.messageInput = document.getElementById('messageInput');
    this.sendButton = document.getElementById('sendButton');
    this.loginPrompt = document.getElementById('loginPrompt');
    this.chatInputArea = document.getElementById('chatInputArea');
    
    // 메시지 전송 이벤트 리스너 등록
    this.sendButton.addEventListener('click', () => this.sendMessage());
    
    // 한글 입력 버그 수정: IME 입력 관련 플래그
    this.isComposing = false;
    
    // IME 입력 시작 이벤트 감지
    this.messageInput.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });
    
    // IME 입력 종료 이벤트 감지
    this.messageInput.addEventListener('compositionend', () => {
      this.isComposing = false;
      // IME 입력 완료 후 텍스트 영역 높이 조절
      this.adjustTextareaHeight();
    });
    
    // 키다운 이벤트를 IME 상태에 따라 처리
    this.messageInput.addEventListener('keydown', (event) => {
      // IME 입력 중일 때는 엔터키 처리하지 않음
      if (this.isComposing || event.isComposing || event.keyCode === 229) {
        return;
      }
      
      // 엔터 키를 눌렀고 shift키는 누르지 않았을 때 메시지 전송
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // 폼 제출 방지
        this.sendMessage();
      }
    });
    
    // 텍스트 영역 크기 자동 조절
    this.messageInput.addEventListener('input', () => {
      // IME 입력 중이 아닐 때만 높이 조절
      if (!this.isComposing) {
        this.adjustTextareaHeight();
      }
    });
    
    // 로그인 상태 확인 및 처리
    this.checkLoginStatus();
  }
  
  // 로그인 상태 확인
  async checkLoginStatus() {
    try {
      const response = await fetch('/api/auth/check');
      const data = await response.json();
      
      if (data.isLoggedIn) {
        // 로그인 상태이면 채팅 입력창 표시
        this.loginPrompt.classList.add('hidden');
        this.chatInputArea.classList.remove('hidden');
      } else {
        // 로그아웃 상태이면 로그인 버튼 표시
        this.loginPrompt.classList.remove('hidden');
        this.chatInputArea.classList.add('hidden');
      }
    } catch (error) {
      console.error('로그인 상태 확인 오류:', error);
    }
  }
  
  // 텍스트 영역 높이 자동 조절
  adjustTextareaHeight() {
    const textarea = this.messageInput;
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
  }
  
  // 메시지 전송 처리
  async sendMessage() {
    const messageText = this.messageInput.value.trim();
    if (!messageText) return;
    
    try {
      // 사용자 메시지 UI에 추가
      this.addMessage('나', messageText, 'user');
      
      // 입력창 비우기 및 높이 초기화
      this.messageInput.value = '';
      this.messageInput.style.height = 'auto';
      
      // 로딩 메시지 표시
      const loadingMessageId = Date.now();
      this.addMessage('시스템', '요청을 처리 중입니다...', 'system', loadingMessageId);

      // 로딩 표시기 추가
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'loading-indicator';
      loadingIndicator.innerHTML = '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div>';
      
      const loadingMessage = document.getElementById(`message-${loadingMessageId}`);
      if (loadingMessage) {
        loadingMessage.querySelector('.message-content').appendChild(loadingIndicator);
      }
      
      // 서버에 메시지 전송
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: messageText })
      });
      
      // 로딩 메시지 제거
      if (loadingMessage) {
        loadingMessage.remove();
      }
      
      // 응답 처리
      if (!response.ok) {
        throw new Error(`서버 오류: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success === false) {
        this.addMessage('시스템', `오류: ${data.message || '알 수 없는 오류가 발생했습니다.'}`, 'system');
        return;
      }
      
      // 성공적인 응답 처리
      this.handleResponseMessage(data);
      
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      this.addMessage('시스템', `오류가 발생했습니다: ${error.message}`, 'system');
    }
  }
  
  // 응답 메시지 처리
  handleResponseMessage(message) {
    // 서버로부터 응답 메시지 처리
    console.log('서버 응답:', message);
    
    let responseText = message.text || '요청을 처리하는 중 오류가 발생했습니다.';
    
    // 이벤트 세부 정보가 있는 경우 추가 정보 표시
    if (message.eventDetails) {
      const event = message.eventDetails;
      
      // 시작 및 종료 시간 포맷팅
      let formattedTime = '';
      if (event.start) {
        const startDate = new Date(event.start);
        let endDate = null;
        
        if (event.end) {
          endDate = new Date(event.end);
        }
        
        const options = {
          month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
          hour12: false
        };
        
        formattedTime = startDate.toLocaleString('ko-KR', options);
        
        if (endDate) {
          const endTime = endDate.toLocaleString('ko-KR', {
            hour: '2-digit', minute: '2-digit', hour12: false
          });
          formattedTime += ` ~ ${endTime}`;
        }
      }
      
      responseText += `\n\n📅 일정 정보:`;
      responseText += `\n제목: ${event.summary || '제목 없음'}`;
      
      if (formattedTime) {
        responseText += `\n시간: ${formattedTime}`;
      }
      
      if (event.location) {
        responseText += `\n장소: ${event.location}`;
      }
      
      if (event.description) {
        responseText += `\n설명: ${event.description}`;
      }
    }
    
    // 이벤트 목록이 있는 경우 처리
    if (message.events && message.events.length > 0) {
      this.handleEventOptions(message.events);
      return; // 이벤트 목록이 있으면 옵션 처리 후 함수 종료
    }
    
    // action 필드가 있고 성공한 경우 처리
    if (message.action) {
      // 일정 생성 또는 삭제가 성공적으로 완료된 경우 캘린더 새로고침
      if ((message.action === 'create' || message.action === 'delete') && message.success) {
        // 캘린더 새로고침 이벤트 발생
        const refreshEvent = new CustomEvent('refreshCalendar');
        document.dispatchEvent(refreshEvent);
      }
    }
    
    // 'time-too-far' 이유로 이벤트를 찾지 못한 경우
    if (message.reason === 'time-too-far' && message.event) {
      responseText = message.message || responseText;
      
      // 가장 가까운 이벤트 정보 추가
      responseText += `\n\n해당 일정을 삭제하시겠습니까?`;
      
      // 삭제 확인 버튼 추가
      const assistantMessage = this.addMessage('assistant', responseText);
      
      // 확인 버튼 추가
      const confirmButton = document.createElement('button');
      confirmButton.textContent = '삭제하기';
      confirmButton.classList.add('action-button');
      confirmButton.addEventListener('click', () => {
        this.processConfirmedAction({
          action: 'delete',
          eventId: message.event.id
        });
      });
      
      const cancelButton = document.createElement('button');
      cancelButton.textContent = '취소';
      cancelButton.classList.add('action-button', 'cancel');
      cancelButton.addEventListener('click', () => {
        this.addMessage('user', '취소');
        this.addMessage('assistant', '일정 삭제를 취소했습니다.');
      });
      
      const buttonContainer = document.createElement('div');
      buttonContainer.classList.add('button-container');
      buttonContainer.appendChild(confirmButton);
      buttonContainer.appendChild(cancelButton);
      
      assistantMessage.appendChild(buttonContainer);
      return;
    }
    
    // 일반 텍스트 응답 추가
    this.addMessage('assistant', responseText);
  }
  
  // 메시지 추가
  addMessage(sender, text, className, messageId = Date.now()) {
    // 메시지 요소 생성
    const messageElement = document.createElement('div');
    messageElement.id = `message-${messageId}`;
    messageElement.className = `message ${className}`;
    
    // 메시지 내용 컨테이너 생성
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    
    // 현재 시간 포맷팅
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    // 발신자 및 시간 추가
    const senderElement = document.createElement('div');
    senderElement.className = 'message-sender';
    senderElement.textContent = `${sender} · ${timeStr}`;
    contentElement.appendChild(senderElement);
    
    // 텍스트 줄바꿈 처리하여 추가
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    
    // 줄바꿈을 <br> 태그로 변환
    messageText.innerHTML = text.replace(/\n/g, '<br>');
    
    contentElement.appendChild(messageText);
    
    // 메시지 요소에 내용 컨테이너 추가
    messageElement.appendChild(contentElement);
    
    // 메시지 컨테이너에 추가
    this.messagesContainer.appendChild(messageElement);
    
    // 메시지 컨테이너를 맨 아래로 스크롤
    this.scrollToBottom();
  }
  
  // 채팅 영역을 맨 아래로 스크롤하는 함수
  scrollToBottom() {
    // 약간의 지연 후 스크롤 실행 (DOM 업데이트 완료 보장)
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 10);
  }
}

// 전역 인스턴스 생성
const chatManager = new ChatManager(); 