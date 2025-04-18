// app.js - 애플리케이션 메인 진입점 및 공통 기능

// 전역 변수 및 상수
const loadingOverlay = document.getElementById('loadingOverlay');

// 로딩 인디케이터 표시
function showLoading() {
  loadingOverlay.classList.remove('hidden');
}

// 로딩 인디케이터 숨기기
function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// URL에서 에러 파라미터 확인 및 에러 메시지 표시
function checkUrlForErrors() {
  const urlParams = new URLSearchParams(window.location.search);
  const errorType = urlParams.get('error');
  const errorDetails = urlParams.get('details');
  
  if (errorType) {
    // URL에서 에러 파라미터 제거
    window.history.replaceState({}, document.title, '/');
    
    // 에러 유형에 따라 메시지 설정
    let errorMessage = '로그인 중 오류가 발생했습니다.';
    let errorDescription = '';
    
    switch (errorType) {
      case 'auth_code_missing':
        errorMessage = '인증 코드가 없습니다. 다시 로그인해 주세요.';
        break;
      case 'token_exchange_failed':
        errorMessage = '토큰 교환에 실패했습니다. 다시 로그인해 주세요.';
        break;
      case 'auth_process_failed':
        errorMessage = '인증 프로세스 중 오류가 발생했습니다. 다시 로그인해 주세요.';
        // 상세 오류 정보 추가
        if (errorDetails) {
          if (errorDetails === 'invalid_grant') {
            errorDescription = '인증 코드가 유효하지 않거나 만료되었습니다. 다시 로그인해 주세요.';
          } else if (errorDetails === 'unauthorized_client') {
            errorDescription = '클라이언트가 인증되지 않았습니다. 앱 설정을 확인해 주세요.';
          } else if (errorDetails === 'access_denied') {
            errorDescription = '접근이 거부되었습니다. 필요한 권한을 확인해 주세요.';
          }
        }
        break;
      case 'google_error':
        errorMessage = '구글 인증 중 오류가 발생했습니다.';
        if (errorDetails) {
          errorDescription = `오류 상세: ${errorDetails}`;
        }
        break;
    }
    
    // 에러 메시지 표시
    const chatMessages = document.getElementById('chatMessages');
    const errorMessageElement = document.createElement('div');
    errorMessageElement.className = 'message system';
    
    let content = `<p><i class="fas fa-exclamation-circle"></i> ${errorMessage}</p>`;
    if (errorDescription) {
      content += `<p class="error-details">${errorDescription}</p>`;
    }
    
    errorMessageElement.innerHTML = `<div class="message-content">${content}</div>`;
    
    chatMessages.appendChild(errorMessageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// 날짜 포맷팅 유틸리티 함수
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// 상대적 날짜 문자열을 ISO 형식으로 변환 (ex: '오늘', '내일', '다음 주 월요일')
function parseRelativeDate(relativeStr) {
  const now = new Date();
  let date = new Date(now);
  
  // 날짜 설정
  if (relativeStr.includes('오늘')) {
    // 이미 오늘로 설정됨
  } else if (relativeStr.includes('내일')) {
    date.setDate(date.getDate() + 1);
  } else if (relativeStr.includes('모레')) {
    date.setDate(date.getDate() + 2);
  } else if (relativeStr.includes('다음주') || relativeStr.includes('다음 주')) {
    date.setDate(date.getDate() + 7);
    
    // 요일 확인
    if (relativeStr.includes('월요일') || relativeStr.includes('월욜')) {
      date.setDate(date.getDate() - date.getDay() + 1);
    } else if (relativeStr.includes('화요일') || relativeStr.includes('화욜')) {
      date.setDate(date.getDate() - date.getDay() + 2);
    } else if (relativeStr.includes('수요일') || relativeStr.includes('수욜')) {
      date.setDate(date.getDate() - date.getDay() + 3);
    } else if (relativeStr.includes('목요일') || relativeStr.includes('목욜')) {
      date.setDate(date.getDate() - date.getDay() + 4);
    } else if (relativeStr.includes('금요일') || relativeStr.includes('금욜')) {
      date.setDate(date.getDate() - date.getDay() + 5);
    } else if (relativeStr.includes('토요일') || relativeStr.includes('토욜')) {
      date.setDate(date.getDate() - date.getDay() + 6);
    } else if (relativeStr.includes('일요일') || relativeStr.includes('일욜')) {
      date.setDate(date.getDate() - date.getDay() + 7);
    }
  } else if (relativeStr.includes('이번주') || relativeStr.includes('이번 주')) {
    // 이번 주의 특정 요일
    if (relativeStr.includes('월요일') || relativeStr.includes('월욜')) {
      date.setDate(date.getDate() - date.getDay() + 1);
    } else if (relativeStr.includes('화요일') || relativeStr.includes('화욜')) {
      date.setDate(date.getDate() - date.getDay() + 2);
    } else if (relativeStr.includes('수요일') || relativeStr.includes('수욜')) {
      date.setDate(date.getDate() - date.getDay() + 3);
    } else if (relativeStr.includes('목요일') || relativeStr.includes('목욜')) {
      date.setDate(date.getDate() - date.getDay() + 4);
    } else if (relativeStr.includes('금요일') || relativeStr.includes('금욜')) {
      date.setDate(date.getDate() - date.getDay() + 5);
    } else if (relativeStr.includes('토요일') || relativeStr.includes('토욜')) {
      date.setDate(date.getDate() - date.getDay() + 6);
    } else if (relativeStr.includes('일요일') || relativeStr.includes('일욜')) {
      date.setDate(date.getDate() - date.getDay() + 7);
    }
  }
  
  return formatDate(date);
}

// 앱 초기화
function initApp() {
  // 초기 로그인 상태 확인은 authManager에서 이미 호출됨
  
  // URL에서 에러 파라미터 확인
  checkUrlForErrors();
  
  // 각종 UI 요소 초기화 및 이벤트 연결은 각 매니저 클래스에서 처리
  
  // 브라우저 탭 닫기 전에 로그인 상태 확인
  window.addEventListener('beforeunload', () => {
    // 필요한 경우 사용자에게 경고 표시 또는 데이터 정리
  });
  
  console.log('ChatCal 애플리케이션 초기화 완료');
}

// 앱 시작
document.addEventListener('DOMContentLoaded', initApp); 