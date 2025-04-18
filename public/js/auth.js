// auth.js - Google 인증 관련 기능 처리

class AuthManager {
  constructor() {
    this.isLoggedIn = false;
    this.user = null;
    this.token = null;
    
    // DOM 요소 가져오기
    this.googleLoginBtn = document.getElementById('googleLoginBtn');
    this.userName = document.getElementById('userName');
    this.userImage = document.getElementById('userImage');
    this.loginPrompt = document.getElementById('loginPrompt');
    this.chatInputArea = document.getElementById('chatInputArea');
    
    // 이벤트 리스너 등록
    this.googleLoginBtn.addEventListener('click', () => this.initiateLogin());
    
    // 페이지 로드 시 로그인 상태 확인
    this.checkLoginStatus();
  }
  
  // 쿠키에서 값 가져오기
  getCookie(name) {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith(name + '=')) {
        return cookie.substring(name.length + 1);
      }
    }
    return null;
  }
  
  // 로그인 상태 확인
  async checkLoginStatus() {
    try {
      const response = await fetch('/api/auth/check', {
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.isLoggedIn) {
        this.isLoggedIn = true;
        this.user = data.user;
        
        // 쿠키에서 토큰 가져오기
        this.token = this.getCookie('token');
        console.log('토큰 확인 (쿠키에서):', this.token ? '토큰 있음' : '토큰 없음');
        
        this.updateUIForLoggedInUser();
      } else {
        this.isLoggedIn = false;
        this.token = null;
        this.updateUIForLoggedOutUser();
      }
      
      return this.isLoggedIn;
    } catch (error) {
      console.error('로그인 상태 확인 오류:', error);
      this.isLoggedIn = false;
      this.token = null;
      this.updateUIForLoggedOutUser();
      return false;
    }
  }
  
  // 로그인 시작
  async initiateLogin() {
    try {
      showLoading();
      
      const response = await fetch('/api/auth/login');
      const data = await response.json();
      
      // Google 로그인 페이지로 리디렉션
      window.location.href = data.url;
    } catch (error) {
      console.error('로그인 시작 오류:', error);
      hideLoading();
      
      // 사용자에게 오류 메시지 표시
      this.showErrorMessage('로그인을 시작하는 중 오류가 발생했습니다.');
    }
  }
  
  // 로그아웃
  async logout() {
    try {
      showLoading();
      
      await fetch('/api/auth/logout', {
        credentials: 'include'
      });
      
      this.isLoggedIn = false;
      this.user = null;
      this.token = null;
      this.updateUIForLoggedOutUser();
      
      hideLoading();
      
      // 페이지 새로고침
      window.location.reload();
    } catch (error) {
      console.error('로그아웃 오류:', error);
      hideLoading();
      
      // 사용자에게 오류 메시지 표시
      this.showErrorMessage('로그아웃 중 오류가 발생했습니다.');
    }
  }
  
  // 로그인된 사용자용 UI 업데이트
  updateUIForLoggedInUser() {
    if (this.user) {
      this.userName.textContent = this.user.name || this.user.email;
      if (this.user.picture) {
        this.userImage.src = this.user.picture;
      }
      
      // 채팅 입력 영역 표시
      this.loginPrompt.classList.add('hidden');
      this.chatInputArea.classList.remove('hidden');
      
      // 사용자 정보에 로그아웃 기능 추가
      this.userImage.style.cursor = 'pointer';
      this.userImage.title = '로그아웃';
      this.userImage.addEventListener('click', () => this.logout());
      
      // 이벤트 발생: 로그인 완료
      dispatchEvent(new CustomEvent('userLoggedIn', { detail: this.user }));
    }
  }
  
  // 로그아웃된 사용자용 UI 업데이트
  updateUIForLoggedOutUser() {
    this.userName.textContent = '로그인이 필요합니다';
    this.userImage.src = 'https://via.placeholder.com/32';
    
    // 로그인 프롬프트 표시
    this.loginPrompt.classList.remove('hidden');
    this.chatInputArea.classList.add('hidden');
    
    // 이벤트 발생: 로그아웃 완료
    dispatchEvent(new CustomEvent('userLoggedOut'));
  }
  
  // 오류 메시지 표시
  showErrorMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const errorMessageElement = document.createElement('div');
    errorMessageElement.className = 'message system';
    errorMessageElement.innerHTML = `
      <div class="message-content">
        <p><i class="fas fa-exclamation-circle"></i> ${message}</p>
      </div>
    `;
    
    chatMessages.appendChild(errorMessageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // 토큰 가져오기 (API 요청용)
  getToken() {
    if (!this.token) {
      // 토큰이 없으면 쿠키에서 다시 시도
      this.token = this.getCookie('token');
      console.log('토큰 재확인 (쿠키에서):', this.token ? '토큰 있음' : '토큰 없음');
    }
    return this.token;
  }
  
  // 현재 사용자 가져오기
  getUser() {
    return this.user;
  }
  
  // 로그인 상태 가져오기
  getLoginStatus() {
    return this.isLoggedIn;
  }
}

// 전역 인스턴스 생성
const authManager = new AuthManager(); 