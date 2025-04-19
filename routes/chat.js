const express = require('express');
const { OpenAI } = require('openai');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const router = express.Router();

// OpenAI API 키 로깅 (일부만 표시)
const apiKey = process.env.OPENAI_API_KEY || '';
console.log('OpenAI API Key 확인 (처음 10자):', apiKey.substring(0, 10) + '...');
console.log('OpenAI API Key 길이:', apiKey.length);

// OpenAI 설정
let openai;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1",
    dangerouslyAllowBrowser: true
  });
  console.log('OpenAI 클라이언트 초기화 성공');
} catch (err) {
  console.error('OpenAI 클라이언트 초기화 오류:', err);
}

// Google OAuth 클라이언트 설정
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3002/api/auth/callback';

// 캘린더 API 초기화 함수
const getCalendarClient = (accessToken) => {
  console.log('[캘린더] 캘린더 클라이언트 초기화 시작');
  
  if (!accessToken) {
    throw new Error('캘린더 API 초기화에 실패했습니다: 액세스 토큰이 없습니다');
  }
  
  console.log('[캘린더] 액세스 토큰:', accessToken.substring(0, 10) + '...');
  
  try {
    // OAuth2 클라이언트 생성
    const oauth2Client = new OAuth2Client(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );
    
    // 토큰 설정 - access_token만 설정
    oauth2Client.setCredentials({
      access_token: accessToken
    });
    
    console.log('[캘린더] 토큰 설정 완료, 캘린더 클라이언트 반환');
    
    // 테스트 호출로 토큰 유효성 검증
    return google.calendar({ 
      version: 'v3', 
      auth: oauth2Client,
      timeout: 10000, // 타임아웃 10초 설정
      retry: true     // 자동 재시도 활성화
    });
  } catch (error) {
    console.error('[캘린더] 캘린더 클라이언트 초기화 오류:', error.message);
    throw new Error('캘린더 API 클라이언트 생성 실패: ' + error.message);
  }
};

// 캘린더에 이벤트 생성
const createCalendarEvent = async (calendar, eventData) => {
  console.log('[캘린더] 이벤트 생성 시작:', JSON.stringify(eventData).substring(0, 100) + '...');
  
  try {
    // 기본 이벤트 데이터 구조 확인
    const event = {
      summary: eventData.summary || '새 일정',
      description: eventData.description || '',
      location: eventData.location || '',
      start: {},
      end: {}
    };
    
    // 시작 시간 처리
    if (eventData.start) {
      if (eventData.start.dateTime) {
        // 시간 지정 일정
        let startDateTime = new Date(eventData.start.dateTime);
        
        // 유효하지 않은 날짜인 경우 현재 시간으로 설정
        if (startDateTime.toString() === 'Invalid Date') {
          console.log('[캘린더] 유효하지 않은 시작 시간, 현재 시간으로 대체');
          startDateTime = new Date();
          startDateTime.setHours(startDateTime.getHours() + 1, 0, 0, 0); // 1시간 후로 설정
        }
        
        event.start = {
          dateTime: startDateTime.toISOString(),
          timeZone: 'Asia/Seoul'
        };
        
        // 종료 시간 설정
        if (eventData.end && eventData.end.dateTime) {
          let endDateTime = new Date(eventData.end.dateTime);
          
          // 유효하지 않은 날짜인 경우 시작 시간 + 1시간으로 설정
          if (endDateTime.toString() === 'Invalid Date') {
            console.log('[캘린더] 유효하지 않은 종료 시간, 시작 시간 + 1시간으로 대체');
            endDateTime = new Date(startDateTime);
            endDateTime.setHours(endDateTime.getHours() + 1);
          }
          
          // 종료 시간이 시작 시간보다 이전이면 시작 시간 + 1시간으로 조정
          if (endDateTime <= startDateTime) {
            console.log('[캘린더] 종료 시간이 시작 시간보다 이전, 시작 시간 + 1시간으로 조정');
            endDateTime = new Date(startDateTime);
            endDateTime.setHours(endDateTime.getHours() + 1);
          }
          
          event.end = {
            dateTime: endDateTime.toISOString(),
            timeZone: 'Asia/Seoul'
          };
        } else {
          // 종료 시간이 없으면 시작 시간 + 1시간
          const endTime = new Date(startDateTime);
          endTime.setHours(endTime.getHours() + 1);
          event.end = {
            dateTime: endTime.toISOString(),
            timeZone: 'Asia/Seoul'
          };
        }
      } 
      else if (eventData.start.date) {
        // 하루종일 일정
        event.start = {
          date: eventData.start.date
        };
        
        // 종료일 설정 (하루종일 일정은 종료일이 시작일 다음날이어야 함)
        if (eventData.end && eventData.end.date) {
          event.end = {
            date: eventData.end.date
          };
        } else {
          const endDate = new Date(eventData.start.date);
          endDate.setDate(endDate.getDate() + 1);
          event.end = {
            date: endDate.toISOString().split('T')[0]
          };
        }
      }
    } else {
      // 시작 시간 정보가 없으면 현재 시간 기준으로 설정
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 3600000);
      
      event.start = {
        dateTime: now.toISOString(),
        timeZone: 'Asia/Seoul'
      };
      
      event.end = {
        dateTime: oneHourLater.toISOString(),
        timeZone: 'Asia/Seoul'
      };
    }
    
    // 추가 옵션 설정
    if (eventData.colorId) {
      event.colorId = eventData.colorId;
    }
    
    if (eventData.reminders) {
      event.reminders = eventData.reminders;
    } else {
      // 기본 알림 설정
      event.reminders = {
        useDefault: true
      };
    }
    
    console.log('[캘린더] 최종 이벤트 데이터:', JSON.stringify(event, null, 2));
    
    // Google Calendar API 호출
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all' // 참석자가 있는 경우 이메일 알림 전송
    });
    
    console.log('[캘린더] 이벤트 생성 성공. ID:', response.data.id);
    return {
      success: true,
      event: response.data
    };
  } catch (error) {
    console.error('[캘린더] 이벤트 생성 실패:', error.message);
    
    if (error.response) {
      console.error('[캘린더] API 응답 코드:', error.response.status);
      console.error('[캘린더] API 오류 데이터:', JSON.stringify(error.response.data, null, 2));
    }
    
    return {
      success: false,
      error: error.message,
      details: error.response?.data || '알 수 없는 오류'
    };
  }
};

// 캘린더 일정 업데이트 함수
const updateCalendarEvent = async (calendar, eventData) => {
  console.log('[캘린더] 이벤트 업데이트 시작:', JSON.stringify(eventData).substring(0, 100) + '...');
  
  try {
    if (!eventData.id) {
      throw new Error('이벤트 ID가 없어 업데이트할 수 없습니다');
    }
    
    // 업데이트할 이벤트 데이터 준비
    const updateData = { ...eventData };
    
    // timeZone 정보가 없으면 추가
    if (updateData.start && updateData.start.dateTime && !updateData.start.timeZone) {
      updateData.start.timeZone = 'Asia/Seoul';
    }
    
    if (updateData.end && updateData.end.dateTime && !updateData.end.timeZone) {
      updateData.end.timeZone = 'Asia/Seoul';
    }
    
    // Google Calendar API 호출
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventData.id,
      resource: updateData,
      sendUpdates: 'all'
    });
    
    console.log('[캘린더] 이벤트 업데이트 성공. ID:', response.data.id);
    return {
      success: true,
      event: response.data
    };
  } catch (error) {
    console.error('[캘린더] 이벤트 업데이트 실패:', error.message);
    
    if (error.response) {
      console.error('[캘린더] API 응답 코드:', error.response.status);
      console.error('[캘린더] API 오류 데이터:', JSON.stringify(error.response.data, null, 2));
    }
    
    return {
      success: false,
      error: error.message,
      details: error.response?.data || '알 수 없는 오류'
    };
  }
};

// 캘린더 일정 삭제 함수
const deleteCalendarEvent = async (calendar, eventId) => {
  console.log('[캘린더] 이벤트 삭제 시작, ID:', eventId);
  
  try {
    if (!eventId) {
      throw new Error('삭제할 이벤트 ID가 없습니다');
    }
    
    // Google Calendar API 호출
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
      sendUpdates: 'all'
    });
    
    console.log('[캘린더] 이벤트 삭제 성공. ID:', eventId);
    return {
      success: true,
      message: '일정이 성공적으로 삭제되었습니다.',
      action: 'delete'
    };
  } catch (error) {
    console.error('[캘린더] 이벤트 삭제 실패:', error.message);
    
    if (error.response) {
      console.error('[캘린더] API 응답 코드:', error.response.status);
      console.error('[캘린더] API 오류 데이터:', JSON.stringify(error.response.data, null, 2));
    }
    
    return {
      success: false,
      error: error.message,
      details: error.response?.data || '알 수 없는 오류'
    };
  }
};

// 캘린더 일정 조회 함수
const getCalendarEvents = async (calendar, timeMin, timeMax, query = null) => {
  console.log('[캘린더] 이벤트 조회 시작');
  console.log(`[캘린더] 조회 파라미터: timeMin=${timeMin}, timeMax=${timeMax}, query=${query || 'null'}`);
  
  try {
    // 기본 시간 범위 설정 (현재부터 7일)
    if (!timeMin) {
      timeMin = new Date().toISOString();
    }
    
    if (!timeMax) {
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 7);
      timeMax = maxDate.toISOString();
    }
    
    console.log(`[캘린더] 조회 기간: ${new Date(timeMin).toLocaleDateString()} ~ ${new Date(timeMax).toLocaleDateString()}`);
    
    // API 요청 옵션
    const requestOptions = {
      calendarId: 'primary',
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true, // 반복 이벤트를 개별 인스턴스로 확장
      orderBy: 'startTime',
      maxResults: 100 // 최대 조회 개수
    };
    
    // 검색어가 있으면 추가
    if (query) {
      requestOptions.q = query;
      console.log(`[캘린더] 검색어: ${query}`);
    }
    
    console.log('[캘린더] 요청 옵션:', JSON.stringify(requestOptions));
    
    // Google Calendar API 호출
    const response = await calendar.events.list(requestOptions);
    
    const events = response.data.items || [];
    console.log(`[캘린더] 이벤트 조회 성공. 총 ${events.length}개 일정 조회됨`);
    
    // 상세 이벤트 정보 로깅 (첫 5개만)
    if (events.length > 0) {
      console.log('[캘린더] 조회된 일정 샘플:');
      events.slice(0, 5).forEach((event, i) => {
        console.log(`[캘린더] 일정 ${i+1}: ${event.summary}, 시작: ${event.start?.dateTime || event.start?.date}, ID: ${event.id}`);
      });
    }
    
    return {
      success: true,
      events: events
    };
  } catch (error) {
    console.error('[캘린더] 이벤트 조회 실패:', error.message);
    
    if (error.response) {
      console.error('[캘린더] API 응답 코드:', error.response.status);
      console.error('[캘린더] API 오류 데이터:', JSON.stringify(error.response.data, null, 2));
    }
    
    return {
      success: false,
      error: error.message,
      details: error.response?.data || '알 수 없는 오류'
    };
  }
};

// 유틸리티 함수: 날짜 및 시간을 ISO 문자열로 변환
const convertToISOString = (date, time) => {
  // date: "2023-04-18", time: "14:00" 형식 가정
  if (!date) return null;
  
  const dateObj = new Date(date);
  
  if (time) {
    const [hours, minutes] = time.split(':');
    dateObj.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  }
  
  return dateObj.toISOString();
};

// 일정 의도 감지 및 캘린더 작업 수행
const processCalendarIntent = async (text, accessToken) => {
  console.log('[캘린더] 일정 의도 감지 시작');
  
  // 액세스 토큰 검증
  if (!accessToken) {
    console.error('[캘린더] 액세스 토큰이 없습니다.');
    return { 
      intent: 'unknown',
      success: false,
      error: '캘린더에 액세스할 수 없습니다. 다시 로그인해주세요.' 
    };
  }
  
  // 간단한 일정 관련 키워드 감지
  const createKeywords = ['추가', '생성', '만들어', '새로운 일정', '일정 잡아', '등록'];
  const updateKeywords = ['수정', '변경', '업데이트'];
  const deleteKeywords = ['삭제', '취소', '제거'];
  const getKeywords = ['조회', '보여', '알려', '일정 확인', '일정 보여', '뭐 있어'];
  
  let intent = 'unknown';
  
  if (createKeywords.some(keyword => text.includes(keyword))) {
    intent = 'create';
  } else if (updateKeywords.some(keyword => text.includes(keyword))) {
    intent = 'update';
  } else if (deleteKeywords.some(keyword => text.includes(keyword))) {
    intent = 'delete';
  } else if (getKeywords.some(keyword => text.includes(keyword))) {
    intent = 'get';
  }
  
  console.log('[캘린더] 감지된 의도:', intent);
  
  // 테스트 목적으로 일정 조회 시도
  try {
    const calendar = getCalendarClient(accessToken);
    
    // 일정 조회 테스트
    console.log('[캘린더] 일정 조회 시작');
    
    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setHours(0, 0, 0, 0);
    
    const timeMax = new Date(timeMin);
    timeMax.setDate(timeMax.getDate() + 7); // 7일간의 일정
    
    console.log('[캘린더] 조회 기간:', 
      timeMin.toISOString(), '~', 
      timeMax.toISOString()
    );
    
    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      const events = response.data.items || [];
      console.log('[캘린더] 일정 조회 성공. 일정 수:', events.length);
      
      // 첫 번째 이벤트 정보 출력 (디버깅용)
      if (events.length > 0) {
        const firstEvent = events[0];
        console.log('[캘린더] 첫 번째 일정:', {
          id: firstEvent.id,
          summary: firstEvent.summary,
          start: firstEvent.start,
          end: firstEvent.end
        });
      }
      
      return {
        intent,
        success: true,
        message: `${events.length}개의 일정을 찾았습니다.`,
        events: events.map(event => ({
          id: event.id,
          title: event.summary || '제목 없음',
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          location: event.location,
          description: event.description
        }))
      };
    } catch (apiError) {
      console.error('[캘린더] API 호출 오류:', apiError.message);
      
      if (apiError.response) {
        console.error('[캘린더] 오류 상태 코드:', apiError.response.status);
        console.error('[캘린더] 오류 데이터:', JSON.stringify(apiError.response.data));
      }
      
      // 401, 403 오류는 인증 문제
      if (apiError.response && [401, 403].includes(apiError.response.status)) {
        return {
          intent,
          success: false,
          error: '캘린더 접근 권한이 없습니다. 다시 로그인하거나 Google Cloud Console에서 API 권한을 확인하세요.'
        };
      }
      
      return {
        intent,
        success: false,
        error: `캘린더 API 오류: ${apiError.message}`
      };
    }
  } catch (error) {
    console.error('[캘린더] 처리 오류:', error);
    
    return {
      intent,
      success: false,
      error: `캘린더 처리 중 오류가 발생했습니다: ${error.message}`
    };
  }
};

// 인증 검증 및 캘린더 클라이언트 생성
const authenticateUser = async (req, res) => {
  console.log('[인증] 사용자 인증 검증 시작');
  
  try {
    // JWT 토큰 확인
    const token = req.cookies.token;
    if (!token) {
      console.error('[인증] 토큰 없음');
      return {
        authenticated: false,
        error: '로그인이 필요합니다. Google 계정으로 로그인해주세요.'
      };
    }
    
    // JWT 토큰 검증
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('[인증] 토큰 검증 성공:', decoded.email);
    } catch (error) {
      console.error('[인증] 토큰 검증 실패:', error.message);
      res.clearCookie('token'); // 잘못된 토큰은 삭제
      return {
        authenticated: false,
        error: '인증이 만료되었습니다. 다시 로그인해주세요.'
      };
    }
    
    // Google OAuth 클라이언트 생성
    const oAuth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.REDIRECT_URI
    );
    
    // 저장된 리프레시 토큰이 있는지 확인
    if (!decoded.refreshToken && !decoded.refresh_token) {
      console.warn('[인증] 리프레시 토큰 없음, 액세스 토큰만으로 진행');
      // 액세스 토큰만 설정
      oAuth2Client.setCredentials({
        access_token: decoded.accessToken || decoded.access_token,
        expiry_date: decoded.tokenExpiry || decoded.expiry_date
      });
    } else {
      // 모든 토큰 설정
      oAuth2Client.setCredentials({
        refresh_token: decoded.refreshToken || decoded.refresh_token,
        access_token: decoded.accessToken || decoded.access_token,
        expiry_date: decoded.tokenExpiry || decoded.expiry_date
      });
    }
    
    // 토큰이 만료되었는지 확인
    let isExpired = false;
    try {
      isExpired = oAuth2Client.isTokenExpiring();
      console.log('[인증] 토큰 만료 여부 확인:', isExpired);
    } catch (error) {
      console.warn('[인증] 토큰 만료 확인 중 오류:', error.message);
      // 토큰 유효성을 시간으로 직접 확인
      if (decoded.expiry_date || decoded.tokenExpiry) {
        const expiry = decoded.expiry_date || decoded.tokenExpiry;
        isExpired = new Date().getTime() >= expiry;
        console.log('[인증] 수동 토큰 만료 확인:', isExpired);
      }
    }
    
    // 토큰이 만료되었고 리프레시 토큰이 있다면 갱신 시도
    if (isExpired && (decoded.refreshToken || decoded.refresh_token)) {
      console.log('[인증] 토큰 갱신 시도');
      try {
        const { tokens } = await oAuth2Client.refreshAccessToken();
        console.log('[인증] 토큰 갱신 성공');
        
        // 리프레시된 토큰 설정
        oAuth2Client.setCredentials(tokens);
        
        // 새 JWT 토큰 생성 및 쿠키 설정
        const newToken = jwt.sign(
          {
            email: decoded.email,
            refresh_token: tokens.refresh_token || decoded.refresh_token,
            access_token: tokens.access_token,
            expiry_date: tokens.expiry_date
          },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );
        
        // 새 쿠키 설정
        const cookieOptions = {
          httpOnly: true,
          maxAge: 3600000, // 1시간
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        };
        res.cookie('token', newToken, cookieOptions);
        console.log('[인증] 새 쿠키 설정 완료');
      } catch (error) {
        console.error('[인증] 토큰 갱신 실패:', error.message);
        res.clearCookie('token');
        return {
          authenticated: false,
          error: '인증 갱신에 실패했습니다. 다시 로그인해주세요.'
        };
      }
    }
    
    // Calendar API 클라이언트 생성
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
    
    return {
      authenticated: true,
      calendar,
      email: decoded.email
    };
  } catch (error) {
    console.error('[인증] 인증 과정 오류:', error.message);
    return {
      authenticated: false,
      error: '인증 처리 중 오류가 발생했습니다. 다시 시도해주세요.'
    };
  }
};

// 일정 관리 목적의 프롬프트
const systemPrompt = `당신은 일정 관리 비서입니다. 항상 유효한 JSON 형식으로 응답하세요.

요청에 따라 다음과 같은 형식으로 응답하세요:

1. 일정 생성 요청 시:
{
  "action": "create",
  "response": "일정을 추가했습니다",
  "event": {
    "summary": "일정 제목",
    "description": "일정 설명",
    "location": "장소",
    "start": {
      "dateTime": "YYYY-MM-DDTHH:MM:SS",
      "timeZone": "Asia/Seoul"
    },
    "end": {
      "dateTime": "YYYY-MM-DDTHH:MM:SS",
      "timeZone": "Asia/Seoul"
    }
  }
}

dateTime은 정확한 ISO 형식이어야 하며, 현재 날짜와 사용자가 요청한 시간을 기준으로 설정하세요.
예를 들어 현재가 2024-12-24이고, 사용자가 "오늘 저녁 8시에 약속 추가해줘"라고 요청하면:
"dateTime": "2024-12-24T20:00:00"와 같이 설정해야 합니다.

2. 일정 수정 요청 시:
{
  "action": "update",
  "response": "일정을 수정했습니다",
  "event": {
    "id": "이벤트 ID",
    "summary": "수정된 제목",
    "start": { "dateTime": "YYYY-MM-DDTHH:MM:SS" },
    "end": { "dateTime": "YYYY-MM-DDTHH:MM:SS" }
  }
}

3. 일정 삭제 요청 시:
{
  "action": "delete",
  "response": "일정을 삭제했습니다",
  "eventId": "이벤트 제목 또는 ID"
}

삭제 요청 시에는 실제 이벤트 ID를 모르는 경우가 많으므로, 사용자가 언급한 이벤트의 제목을 eventId 필드에 그대로 입력하세요.
예: 사용자가 "오늘 저녁 7시 돈호 약속 삭제해줘"라고 하면 eventId에 "돈호 약속"이라고 입력하면 됩니다.

4. 일정 조회 요청 시:
{
  "action": "get",
  "response": "일정을 조회했습니다",
  "timeMin": "YYYY-MM-DDTHH:MM:SSZ",
  "timeMax": "YYYY-MM-DDTHH:MM:SSZ",
  "query": "검색어(선택사항)"
}

5. 일반 대화:
{
  "action": "none",
  "response": "이해했습니다"
}

사용자가 "오늘 저녁 8시에 돈호 저녁약속 추가해줘"와 같이 말하면, 이는 명백한 일정 생성 요청으로 처리하고 action을 "create"로 설정하세요. 일정 생성 시 summary, start, end는 필수 항목입니다.

현재 날짜와 시간을 기준으로 상대적인 시간(오늘, 내일, 다음 주 등)을 해석하여 정확한 ISO 형식의 날짜와 시간으로 변환하세요.

모든 일정 관련 키워드(추가, 생성, 만들기, 등록 등)를 주의 깊게 감지하고 적절한 action을 설정하세요.`;

// 테스트 모드인지 확인하는 함수
const isTestMode = (user) => {
  return user && user.accessToken === 'test-access-token';
};

// 테스트용 가상 캘린더 데이터
const mockCalendarEvents = [
  {
    id: 'test123',
    summary: '팀 미팅',
    start: { dateTime: new Date().setHours(14, 0, 0, 0), timeZone: 'Asia/Seoul' },
    end: { dateTime: new Date().setHours(15, 0, 0, 0), timeZone: 'Asia/Seoul' },
    location: '회의실 A',
    description: '주간 팀 미팅'
  },
  {
    id: 'test456',
    summary: '점심 약속',
    start: { dateTime: new Date().setHours(12, 0, 0, 0), timeZone: 'Asia/Seoul' },
    end: { dateTime: new Date().setHours(13, 0, 0, 0), timeZone: 'Asia/Seoul' },
    location: '한식당',
    description: '팀원들과 점심 식사'
  }
];

// 테스트 모드용 캘린더 이벤트 조회 함수
const getMockCalendarEvents = async () => {
  console.log('[캘린더 테스트] 가상 일정 조회');
  return {
    success: true,
    events: mockCalendarEvents
  };
};

// 테스트 모드용 캘린더 이벤트 생성 함수
const createMockCalendarEvent = async (eventData) => {
  console.log('[캘린더 테스트] 가상 일정 생성:', eventData);
  
  const newEvent = {
    id: 'mock_' + Date.now(),
    ...eventData
  };
  
  mockCalendarEvents.push(newEvent);
  
  return {
    success: true,
    event: newEvent
  };
};

// 테스트 모드용 캘린더 이벤트 삭제 함수
const deleteMockCalendarEvent = async (eventId) => {
  console.log('[캘린더 테스트] 가상 일정 삭제:', eventId);
  
  const index = mockCalendarEvents.findIndex(event => event.id === eventId);
  
  if (index !== -1) {
    mockCalendarEvents.splice(index, 1);
    return {
      success: true,
      eventId: eventId
    };
  }
  
  return {
    success: false,
    error: '일정을 찾을 수 없습니다.'
  };
};

// 메시지에서 날짜 정보 추출
async function extractDateInfo(message) {
  console.log('[채팅] 날짜 정보 추출 시작:', message);
  
  // 한국어 날짜 표현 정규식 (오늘, 내일, 모레, 요일 등)
  const koreanDateRegex = /(오늘|내일|모레|이번\s*주|다음\s*주|([0-9]+)월\s*([0-9]+)일|다음\s*달|(월|화|수|목|금|토|일)요일)/;
  const timeRegex = /([0-9]+)시\s*([0-9]+)?분?/;
  
  let dateStr = '오늘'; // 기본값
  let targetDate = new Date();
  
  // 날짜 정보 추출
  const dateMatch = message.match(koreanDateRegex);
  if (dateMatch) {
    dateStr = dateMatch[0];
    console.log('[채팅] 감지된 날짜 표현:', dateStr);
    
    if (dateStr === '내일') {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (dateStr === '모레') {
      targetDate.setDate(targetDate.getDate() + 2);
    } else if (dateStr.includes('다음 주')) {
      targetDate.setDate(targetDate.getDate() + 7);
    } else if (dateStr.match(/([0-9]+)월\s*([0-9]+)일/)) {
      const monthDayMatch = dateStr.match(/([0-9]+)월\s*([0-9]+)일/);
      const month = parseInt(monthDayMatch[1]) - 1; // JavaScript 월은 0부터 시작
      const day = parseInt(monthDayMatch[2]);
      
      targetDate.setMonth(month);
      targetDate.setDate(day);
      
      // 지정한 날짜가 현재보다 과거인 경우 내년으로 설정
      if (targetDate < new Date()) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
    } else if (dateStr.includes('요일')) {
      const dayMap = {
        '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, 
        '금요일': 5, '토요일': 6, '일요일': 0
      };
      
      const today = targetDate.getDay();
      let targetDay;
      
      for (const [key, value] of Object.entries(dayMap)) {
        if (dateStr.includes(key)) {
          targetDay = value;
          break;
        }
      }
      
      if (targetDay !== undefined) {
        // 이번 주의 해당 요일 계산
        const daysToAdd = (targetDay - today + 7) % 7;
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        
        // "다음 주" 표현이 있으면 7일 더 추가
        if (dateStr.includes('다음 주')) {
          targetDate.setDate(targetDate.getDate() + 7);
        }
      }
    }
  }
  
  // 시간 정보 추출
  let hour = 9; // 기본 시간
  let minute = 0;
  
  const timeMatch = message.match(timeRegex);
  if (timeMatch) {
    hour = parseInt(timeMatch[1]);
    minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    
    console.log(`[채팅] 감지된 시간: ${hour}시 ${minute}분`);
  }
  
  targetDate.setHours(hour, minute, 0, 0);
  
  console.log('[채팅] 변환된 날짜시간:', targetDate.toISOString());
  return { targetDate, dateStr };
}

// Google Calendar에서 이벤트 검색
async function findEventByTitle(req, eventTitle, targetDate) {
  console.log(`[채팅] 일정 검색 시작: "${eventTitle}", 날짜: ${targetDate.toISOString()}`);
  
  try {
    // 날짜 범위 설정 (해당 날짜의 전체 기간)
    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);
    
    console.log(`[채팅] 검색 범위: ${startDate.toISOString()} ~ ${endDate.toISOString()}`);
    
    // Calendar API 요청
    const response = await axios.get(`${req.protocol}://${req.get('host')}/api/calendar/events`, {
      headers: {
        Cookie: req.headers.cookie
      },
      params: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString()
      }
    });
    
    const events = response.data.events || [];
    console.log(`[채팅] 조회된 이벤트 수: ${events.length}`);
    
    if (events.length === 0) {
      console.log(`[채팅] ${targetDate.toLocaleDateString('ko-KR')}에 일정이 없습니다`);
      return {
        found: false,
        reason: 'no-events-on-date',
        message: `${targetDate.toLocaleDateString('ko-KR')}에 등록된 일정이 없습니다.`
      };
    }
    
    // 이벤트 목록 로깅
    events.forEach((event, index) => {
      const start = event.start.dateTime || event.start.date;
      console.log(`[채팅] 이벤트 ${index + 1}: ${event.summary}, 시작: ${start}`);
    });
    
    // 제목으로 일정 검색
    let matchedEvents = [];
    
    if (eventTitle && eventTitle.trim() !== '') {
      // 1. 제목과 정확히 일치하는 이벤트 우선 검색
      const exactMatch = events.find(event => 
        event.summary && event.summary.toLowerCase() === eventTitle.toLowerCase()
      );
      
      if (exactMatch) {
        console.log(`[채팅] 정확히 일치하는 일정 찾음: ${exactMatch.summary}`);
        return exactMatch;
      }
      
      // 2. 제목에 키워드가 포함된 이벤트 검색
      matchedEvents = events.filter(event => 
        event.summary && event.summary.toLowerCase().includes(eventTitle.toLowerCase())
      );
      
      console.log(`[채팅] 키워드가 포함된 일정 수: ${matchedEvents.length}`);
      
      // 3. 유사도 검색 - 부분 문자열 매칭 (검색어 단어들이 이벤트 제목에 부분적으로 포함되는지 확인)
      if (matchedEvents.length === 0) {
        console.log('[채팅] 키워드 포함 검색 실패, 부분 단어 매칭 시도');
        const searchTerms = eventTitle.toLowerCase().split(/\s+/);
        
        matchedEvents = events.filter(event => {
          if (!event.summary) return false;
          const eventSummaryLower = event.summary.toLowerCase();
          // 검색어의 단어 중 하나라도 제목에 포함되면 매칭으로 간주
          return searchTerms.some(term => eventSummaryLower.includes(term));
        });
        
        console.log(`[채팅] 부분 단어 매칭으로 찾은 일정 수: ${matchedEvents.length}`);
      }
      
      if (matchedEvents.length === 1) {
        console.log(`[채팅] 일치하는 일정 찾음: ${matchedEvents[0].summary}`);
        return matchedEvents[0];
      } else if (matchedEvents.length > 1) {
        console.log('[채팅] 여러 일정이 일치함, 시간으로 필터링 시도');
        // 4. 특정 시간에 가장 가까운 이벤트 찾기
        const closestEvent = findClosestEventByTime(matchedEvents, targetDate);
        if (closestEvent) return closestEvent;
        
        // 만약 시간으로 찾지 못하면, 모든 매칭된 이벤트 정보를 반환
        return {
          found: false,
          reason: 'multiple-matches',
          message: `"${eventTitle}" 키워드와 일치하는 일정이 여러 개 있습니다.`,
          events: matchedEvents.map(e => ({
            summary: e.summary,
            start: e.start.dateTime || e.start.date
          }))
        };
      }
    }
    
    // 5. 시간으로 가장 가까운 이벤트 찾기
    console.log('[채팅] 제목으로 찾지 못함, 시간으로 찾기 시도');
    const closestEvent = findClosestEventByTime(events, targetDate);
    
    if (closestEvent) {
      return closestEvent;
    } else {
      // 시간으로도 찾지 못한 경우, 해당 날짜의 모든 이벤트 목록 제공
      return {
        found: false,
        reason: 'no-match-by-title-or-time',
        message: eventTitle 
          ? `"${eventTitle}" 일정을 찾지 못했습니다. ${targetDate.toLocaleDateString('ko-KR')}에 유사한 일정이 없습니다.`
          : `${targetDate.toLocaleDateString('ko-KR')}에 지정한 시간대의 일정을 찾지 못했습니다.`,
        events: events.slice(0, 5).map(e => ({
          summary: e.summary,
          start: e.start.dateTime || e.start.date
        }))
      };
    }
    
  } catch (error) {
    console.error('[채팅] 일정 검색 실패:', error.message);
    if (error.response) {
      console.error('[채팅] API 응답 상태:', error.response.status);
      console.error('[채팅] API 오류 데이터:', error.response.data);
    }
    return {
      found: false,
      reason: 'error',
      message: '일정 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
    };
  }
}

// 시간에 가장 가까운 이벤트 찾기
function findClosestEventByTime(events, targetDate) {
  if (!events || events.length === 0) {
    console.log('[채팅] 일치하는 이벤트가 없습니다');
    return null;
  }
  
  console.log(`[채팅] 시간 기준 이벤트 검색: 목표 시간 ${targetDate.toISOString()}`);
  
  let closestEvent = null;
  let minTimeDiff = Infinity;
  
  const targetTime = targetDate.getTime();
  
  events.forEach(event => {
    if (!event.start || (!event.start.dateTime && !event.start.date)) {
      console.log(`[채팅] 이벤트에 시작 시간 정보가 없습니다: ${event.summary || '제목 없음'}`);
      return;
    }
    
    const eventTime = new Date(event.start.dateTime || event.start.date).getTime();
    const timeDiff = Math.abs(eventTime - targetTime);
    
    console.log(`[채팅] 이벤트: "${event.summary}", 시간 차이: ${Math.round(timeDiff / (60 * 1000))}분`);
    
    if (timeDiff < minTimeDiff) {
      minTimeDiff = timeDiff;
      closestEvent = event;
    }
  });
  
  // 2시간(7,200,000 밀리초) 이내의 이벤트만 반환
  const twoHoursInMs = 2 * 60 * 60 * 1000;
  if (closestEvent && minTimeDiff <= twoHoursInMs) {
    console.log(`[채팅] 가장 가까운 이벤트 찾음: "${closestEvent.summary}", 시간 차이: ${Math.round(minTimeDiff / (60 * 1000))}분`);
    return closestEvent;
  }
  
  console.log(`[채팅] 2시간 이내의 적합한 이벤트를 찾지 못했습니다. 최소 시간 차이: ${Math.round(minTimeDiff / (60 * 1000))}분`);
  
  // 가장 가까운 이벤트를 찾았지만 시간 차이가 너무 큰 경우 처리
  if (closestEvent && minTimeDiff > 120 * 60 * 1000) { // 시간 차이가 2시간 이상인 경우
    console.log(`이벤트를 찾았지만 시간 차이가 너무 큼 (${minTimeDiff/(60*1000)}분). 가장 가까운 이벤트 반환.`);
    
    // 시간 차이를 사용자 친화적인 형식으로 변환
    const diffHours = Math.floor(minTimeDiff / (60 * 60 * 1000));
    const diffMinutes = Math.floor((minTimeDiff % (60 * 60 * 1000)) / (60 * 1000));
    let timeMessage = '';
    
    if (diffHours > 0) {
      timeMessage += `${diffHours}시간 `;
    }
    if (diffMinutes > 0 || diffHours === 0) {
      timeMessage += `${diffMinutes}분`;
    }
    
    return {
      success: false,
      message: `정확한 시간에 일정을 찾지 못했습니다. 가장 가까운 일정은 ${timeMessage} ${minTimeDiff > 0 ? '후' : '전'}에 있습니다.`,
      reason: 'time-too-far',
      event: closestEvent
    };
  }
  
  return null;
}

// 메시지에서 이벤트 제목 추출
function extractEventTitle(message, action) {
  console.log(`[채팅] 일정 제목 추출 시작 (액션: ${action}): ${message}`);
  
  let eventTitle = '';
  
  if (action === 'delete') {
    // 삭제 요청에서 제목 추출 패턴 확장
    const deletePatterns = [
      /(.+?)(?:일정|약속|미팅|회의)(?:을|를)?\s*(?:삭제|제거|취소)(?:해줘|해 줘|해주세요|부탁해|해)/i,
      /(?:삭제|제거|취소)(?:해줘|해 줘|해주세요|부탁해|해)\s*(.+?)(?:일정|약속|미팅|회의)?/i,
      /(.+?)(?:을|를)?\s*(?:삭제|제거|취소)(?:해줘|해 줘|해주세요|부탁해|해)/i,
      /(?:오늘|내일|모레|다음 주)?\s*(.+?)\s*(?:일정|약속|미팅|회의)?\s*(?:삭제|제거|취소)/i
    ];
    
    for (const pattern of deletePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        eventTitle = match[1].trim();
        console.log(`[채팅] 삭제 패턴으로 추출된 제목: "${eventTitle}"`);
        break;
      }
    }
  } else if (action === 'get') {
    // 조회 요청에서 제목 추출
    const getPatterns = [
      /(.+?)(?:일정|약속|미팅|회의)(?:이|가)?\s*(?:있|있어|뭐가|무엇이|뭔지|어떤|언제)/i,
      /(?:일정|약속|미팅|회의)(?:이|가)?\s*(.+?)(?:있|있어|뭐가|무엇이|뭔지|어떤|언제)/i
    ];
    
    for (const pattern of getPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        eventTitle = match[1].trim();
        break;
      }
    }
  }
  
  // 시간 표현 제거
  eventTitle = eventTitle.replace(/\d+시\s*\d*분?/, '').trim();
  
  // 날짜 표현 제거
  eventTitle = eventTitle.replace(/(오늘|내일|모레|이번\s*주|다음\s*주|([0-9]+)월\s*([0-9]+)일|(월|화|수|목|금|토|일)요일)/, '').trim();
  
  console.log(`[채팅] 추출된 일정 제목: "${eventTitle}"`);
  return eventTitle;
}

// 채팅 메시지 처리
router.post('/', async (req, res) => {
  // 사용자 인증 확인
  const user = await authenticateUser(req, res);
  if (!user) {
    return res.status(401).json({ error: "인증이 필요합니다. 로그인 해주세요." });
  }

  console.log('[채팅] 메시지 수신:', req.body.message);
  console.log('[채팅] 사용자:', user.email);

  try {
    // OpenAI에 메시지 전송
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `일정 관리 봇으로서 메시지 분석 후 JSON으로 응답하세요:

1. 일정 관련 여부 판단
   - 아니면:  
     false
   - 관련되면: action, title, start_datetime, end_datetime 추출

2. title 규칙
   - "대상 + 명사형 이벤트" 형태로 변환  
     예: "낼 엄마랑 아빠랑 해운대 갈거야" → "엄마 아빠 해운대 방문"

3. 액션 처리
   - add: start_datetime 필수, end_datetime 선택 → 누락 시 요청  
   - remove: title 또는 start_datetime 필수 

4. 응답 형식
{
  "is_calendar_related": true,
  "action": "add/remove/edit/none",
  "title": "일정 이름",
  "start_datetime": "YYYY-MM-DDTHH:MM:SS",
  "end_datetime": "YYYY-MM-DDTHH:MM:SS"
}

* 날짜/시간: ISO 8601 형식(YYYY-MM-DDTHH:MM:SS+09:00), 현재 시각: ${new Date().toISOString()}
* 상대적 날짜 표현("오늘", "내일" 등)은 정확한 날짜로 변환
* end_datetime 누락 시 start_datetime + 1시간으로 설정`
        },
        { role: "user", content: req.body.message }
      ],
      temperature: 0.2,
    });

    const responseContent = completion.choices[0].message.content;
    console.log('[채팅] OpenAI 응답:', responseContent);

    try {
      // OpenAI 응답 파싱
      const parsedResponse = JSON.parse(responseContent);
      
      // 일정 관련 내용이 아닐 경우
      if (!parsedResponse.is_calendar_related) {
        return res.json({
          message: "저는 일정 관리에 관한 질문만 답변할 수 있습니다.",
          action: "none"
        });
      }
      
      const action = parsedResponse.action;
      console.log('[채팅] 파싱된 액션:', action);

      // 서버 측에서 액션에 따른 기본 응답 메시지 설정
      let responseMessage = "";
      let eventDetails = null;

      // 액션에 따른 처리
      if (action === 'add') {
        // 필수값 체크 (title, start_datetime)
        if (!parsedResponse.title || !parsedResponse.start_datetime) {
          responseMessage = "일정을 추가하려면 제목과 시작 시간이 필요합니다.";
          return res.json({
            message: responseMessage,
            action: action
          });
        }
        
        try {
          console.log('[채팅] 일정 생성 시작:', JSON.stringify(parsedResponse));
          
          // end_datetime이 없으면 start_datetime + 1시간으로 설정
          const startDateTime = new Date(parsedResponse.start_datetime);
          const endDateTime = parsedResponse.end_datetime 
            ? new Date(parsedResponse.end_datetime)
            : new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1시간 추가
          
          // 이벤트 데이터 준비
          const eventData = {
            summary: parsedResponse.title,
            description: parsedResponse.description || '',
            location: parsedResponse.location || '',
            start: {
              dateTime: startDateTime.toISOString(),
              timeZone: 'Asia/Seoul'
            },
            end: {
              dateTime: endDateTime.toISOString(),
              timeZone: 'Asia/Seoul'
            }
          };
          
          // 캘린더 API 호출하여 이벤트 생성
          const response = await axios.post(`${req.protocol}://${req.get('host')}/api/calendar/events`, eventData, {
            headers: {
              'Content-Type': 'application/json',
              Cookie: req.headers.cookie
            }
          });
          
          if (response.data.success) {
            console.log('[채팅] 일정 생성 성공:', response.data.event.id);
            const startDate = new Date(response.data.event.start.dateTime || response.data.event.start.date);
            const formattedDate = `${startDate.getMonth() + 1}월 ${startDate.getDate()}일 ${startDate.getHours()}시`;
            
            responseMessage = `"${response.data.event.summary}" 일정이 ${formattedDate}에 생성되었습니다.`;
            eventDetails = response.data.event;
          } else {
            console.error('[채팅] 일정 생성 실패:', response.data.error);
            responseMessage = `일정 생성에 실패했습니다: ${response.data.error || '알 수 없는 오류'}`;
          }
        } catch (error) {
          console.error('[채팅] 일정 생성 중 오류:', error.message);
          responseMessage = '일정 생성 중 오류가 발생했습니다. 다시 시도해주세요.';
          
          if (error.response) {
            console.error('[채팅] API 응답 코드:', error.response.status);
            console.error('[채팅] API 오류 데이터:', JSON.stringify(error.response.data).substring(0, 200));
          }
        }
      } 
      else if (action === 'remove') {
        // title 또는 start_datetime 중 하나는 필수
        if (!parsedResponse.title && !parsedResponse.start_datetime) {
          responseMessage = "삭제할 일정의 제목이나 시간을 알려주세요.";
          return res.json({
            message: responseMessage,
            action: action
          });
        }
        
        try {
          // start_datetime으로 검색하는 경우
          if (parsedResponse.start_datetime) {
            // 시간 기반 검색을 위한 시간 범위 설정
            const targetDate = new Date(parsedResponse.start_datetime);
            const startOfDay = new Date(targetDate);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(targetDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            // 해당 날짜의 이벤트 조회
            const response = await axios.get(`${req.protocol}://${req.get('host')}/api/calendar/events`, {
              headers: {
                Cookie: req.headers.cookie
              },
              params: {
                timeMin: startOfDay.toISOString(),
                timeMax: endOfDay.toISOString()
              }
            });
            
            const events = response.data.events || [];
            
            if (events.length === 0) {
              responseMessage = "해당 시간에 일정이 없습니다.";
              return res.json({
                message: responseMessage,
                action: action
              });
            }
            
            // 시간에 가장 가까운 이벤트 찾기
            const closestEvent = findClosestEventByTime(events, targetDate);
            
            if (closestEvent) {
              // 이벤트 삭제 API 호출
              const deleteResponse = await axios.delete(`${req.protocol}://${req.get('host')}/api/calendar/events/${closestEvent.id}`, {
                headers: {
                  Cookie: req.headers.cookie
                }
              });
              
              if (deleteResponse.data.success) {
                const eventTime = new Date(closestEvent.start.dateTime || closestEvent.start.date);
                const formattedTime = `${eventTime.getMonth() + 1}월 ${eventTime.getDate()}일 ${eventTime.getHours()}시`;
                
                responseMessage = `"${closestEvent.summary}" 일정이 성공적으로 삭제되었습니다.`;
                eventDetails = closestEvent;
              } else {
                responseMessage = `일정 삭제 중 오류가 발생했습니다: ${deleteResponse.data.error || "알 수 없는 오류"}`;
              }
            } else {
              responseMessage = "해당 시간에 가까운 일정을 찾지 못했습니다.";
            }
          } 
          // title로 검색하는 경우
          else if (parsedResponse.title) {
            // 오늘 날짜로 설정
            const today = new Date();
            
            // 이벤트 검색
            const event = await findEventByTitle(req, parsedResponse.title, today);
            
            if (event) {
              // 이벤트 삭제 API 호출
              const deleteResponse = await axios.delete(`${req.protocol}://${req.get('host')}/api/calendar/events/${event.id}`, {
                headers: {
                  Cookie: req.headers.cookie
                }
              });
              
              if (deleteResponse.data.success) {
                const eventTime = new Date(event.start.dateTime || event.start.date);
                const formattedTime = `${eventTime.getMonth() + 1}월 ${eventTime.getDate()}일 ${eventTime.getHours()}시`;
                
                responseMessage = `"${event.summary}" 일정이 성공적으로 삭제되었습니다.`;
                eventDetails = event;
              } else {
                responseMessage = `일정 삭제 중 오류가 발생했습니다: ${deleteResponse.data.error || "알 수 없는 오류"}`;
              }
            } else {
              responseMessage = `"${parsedResponse.title}" 일정을 찾지 못했습니다. 정확한 일정 제목을 입력해주세요.`;
            }
          }
        } catch (error) {
          console.error('[채팅] 일정 삭제 중 오류:', error.message);
          responseMessage = '일정 삭제 중 오류가 발생했습니다. 다시 시도해주세요.';
          
          if (error.response) {
            console.error('[채팅] API 응답 코드:', error.response.status);
            console.error('[채팅] API 오류 데이터:', JSON.stringify(error.response.data).substring(0, 200));
          }
        }
      }
      else if (action === 'edit') {
        responseMessage = "현재 일정 수정 기능은 지원하지 않습니다. 삭제 후 다시 추가해주세요.";
      }
      else {
        responseMessage = "지원하지 않는 명령입니다. 일정 추가나 삭제만 가능합니다.";
      }

      // 최종 응답
      return res.json({
        message: responseMessage,
        action: action,
        eventDetails: eventDetails
      });
      
    } catch (parseError) {
      console.error('[채팅] 응답 파싱 오류:', parseError);
      return res.json({
        message: "응답을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요.",
        rawResponse: responseContent
      });
    }
  } catch (error) {
    console.error('[채팅] OpenAI API 오류:', error);
    return res.status(500).json({ error: "메시지 처리 중 오류가 발생했습니다." });
  }
});

module.exports = router; 