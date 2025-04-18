const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const router = express.Router();

// 환경 변수
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3002/api/auth/callback';

// 진단 정보 로깅
console.log('[캘린더] 라우터 초기화');
console.log('[캘린더] Google API 클라이언트 ID:', CLIENT_ID ? '설정됨' : '누락됨');
console.log('[캘린더] Google API 클라이언트 Secret:', CLIENT_SECRET ? '설정됨' : '누락됨');
console.log('[캘린더] 리디렉션 URI:', REDIRECT_URI);

// 캘린더 클라이언트 가져오기
const getCalendarClient = (accessToken) => {
  if (!accessToken) {
    throw new Error('액세스 토큰이 필요합니다');
  }
  
  console.log('[캘린더] 클라이언트 초기화, 액세스 토큰:', accessToken.substring(0, 10) + '...');
  
  const oauth2Client = new OAuth2Client(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );
  
  oauth2Client.setCredentials({
    access_token: accessToken
  });
  
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

// 캘린더 목록 조회
router.get('/calendars', async (req, res) => {
  console.log('[캘린더] 캘린더 목록 요청');
  
  try {
    const { accessToken } = req.user;
    
    if (!accessToken) {
      return res.status(401).json({ error: '액세스 토큰이 없습니다' });
    }
    
    const calendar = getCalendarClient(accessToken);
    
    const response = await calendar.calendarList.list({
      maxResults: 10
    });
    
    const calendars = response.data.items;
    console.log('[캘린더] 목록 조회 성공, 캘린더 수:', calendars.length);
    
    res.json({
      success: true,
      calendars: calendars.map(cal => ({
        id: cal.id,
        summary: cal.summary,
        primary: cal.primary || false,
        accessRole: cal.accessRole
      }))
    });
  } catch (error) {
    console.error('[캘린더] 목록 조회 실패:', error.message);
    
    if (error.response) {
      console.error('[캘린더] API 응답 상태:', error.response.status);
      console.error('[캘린더] API 오류 데이터:', JSON.stringify(error.response.data).substring(0, 200));
    }
    
    res.status(500).json({ 
      error: '캘린더 목록을 가져오는 데 실패했습니다', 
      details: error.message 
    });
  }
});

// 현재 주의 일정 가져오기
router.get('/events', async (req, res) => {
  console.log('[캘린더] 일정 조회 요청');
  
  try {
    if (!req.user || !req.user.accessToken) {
      console.error('[캘린더] 액세스 토큰 없음');
      return res.status(401).json({ error: '인증이 필요합니다' });
    }

    const calendar = getCalendarClient(req.user.accessToken);
    const { date, timeMin, timeMax } = req.query;
    
    let startDate, endDate;
    
    // 날짜 형식 처리
    if (date) {
      console.log(`[캘린더] 지정된 날짜로 이벤트 조회: ${date}`);
      
      // 날짜 문자열 처리 (오늘, 내일, 이번주 등)
      if (date === '오늘' || date === 'today') {
        startDate = new Date();
      } else if (date === '내일' || date === 'tomorrow') {
        startDate = new Date();
        startDate.setDate(startDate.getDate() + 1);
      } else if (date.match(/다음\s*주|next\s*week/i)) {
        startDate = new Date();
        startDate.setDate(startDate.getDate() + 7);
      } else {
        // ISO 형식 또는 다른 날짜 문자열 처리 시도
        startDate = new Date(date);
      }
      
      // 유효한 날짜인지 확인
      if (isNaN(startDate.getTime())) {
        console.error(`[캘린더] 유효하지 않은 날짜 형식: ${date}`);
        return res.status(400).json({ error: '유효하지 않은 날짜 형식입니다' });
      }
      
      // 지정된 날짜의 시작과 끝 설정
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeMin && timeMax) {
      // timeMin과 timeMax가 직접 제공된 경우
      console.log(`[캘린더] 시간 범위로 이벤트 조회: ${timeMin} ~ ${timeMax}`);
      startDate = new Date(timeMin);
      endDate = new Date(timeMax);
    } else {
      // 기본값: 현재 시간부터 7일
      console.log('[캘린더] 날짜 지정 없음, 현재부터 7일간 조회');
      startDate = new Date();
      endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
    }
    
    console.log(`[캘린더] 조회 기간: ${startDate.toISOString()} ~ ${endDate.toISOString()}`);
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items;
    console.log(`[캘린더] 조회된 이벤트 수: ${events.length}`);
    
    if (events.length === 0) {
      console.log('[캘린더] 해당 기간에 일정이 없습니다');
      return res.json({
        success: true,
        message: '해당 기간에 일정이 없습니다',
        events: []
      });
    }

    // 이벤트 정보 로깅 (디버깅용)
    events.forEach((event, index) => {
      const start = event.start.dateTime || event.start.date;
      console.log(`[캘린더] 이벤트 ${index + 1}: ${event.summary}, 시작: ${start}, ID: ${event.id}`);
    });

    res.json({
      success: true,
      message: '일정을 성공적으로 조회했습니다',
      events: events.map(event => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.start,
        end: event.end,
        status: event.status,
        creator: event.creator,
        organizer: event.organizer,
        attendees: event.attendees
      }))
    });
  } catch (error) {
    console.error('[캘린더] 일정 조회 실패:', error.message);
    
    if (error.response) {
      console.error('[캘린더] API 응답 상태:', error.response.status);
      console.error('[캘린더] API 오류 데이터:', JSON.stringify(error.response.data).substring(0, 200));
    }
    
    res.status(500).json({ 
      error: '일정을 조회하는 데 실패했습니다', 
      details: error.message 
    });
  }
});

// 새 일정 생성
router.post('/events', async (req, res) => {
  console.log('[캘린더] 일정 생성 요청:', JSON.stringify(req.body).substring(0, 100) + '...');
  
  try {
    const { accessToken } = req.user;
    
    if (!accessToken) {
      return res.status(401).json({ error: '액세스 토큰이 없습니다' });
    }
    
    const { summary, location, description, start, end } = req.body;
    
    // 필수 필드 확인
    if (!summary || !start || !end) {
      return res.status(400).json({ 
        error: '필수 정보가 누락되었습니다',
        details: '제목, 시작 시간, 종료 시간이 필요합니다' 
      });
    }
    
    const calendar = getCalendarClient(accessToken);
    
    // 이벤트 생성
    const response = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all', // 참석자에게 알림
      resource: {
        summary,
        location,
        description,
        start,
        end
      }
    });
    
    console.log('[캘린더] 일정 생성 성공. ID:', response.data.id);
    
    res.status(201).json({
      success: true,
      event: response.data
    });
  } catch (error) {
    console.error('[캘린더] 일정 생성 실패:', error.message);
    
    if (error.response) {
      console.error('[캘린더] API 응답 상태:', error.response.status);
      console.error('[캘린더] API 오류 데이터:', JSON.stringify(error.response.data).substring(0, 200));
    }
    
    let status = 500;
    let errorMessage = '일정을 생성하는 데 실패했습니다';
    
    // 오류 유형에 따른 처리
    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        status = 401;
        errorMessage = '캘린더 접근 권한이 없습니다';
      } else if (error.response.status === 400) {
        status = 400;
        errorMessage = '잘못된 일정 정보입니다';
      }
    }
    
    res.status(status).json({ 
      error: errorMessage, 
      details: error.message 
    });
  }
});

// 일정 삭제
router.delete('/events/:eventId', async (req, res) => {
  console.log('[캘린더] 일정 삭제 요청:', req.params.eventId);
  
  try {
    const { accessToken } = req.user;
    
    if (!accessToken) {
      return res.status(401).json({ error: '액세스 토큰이 없습니다' });
    }
    
    const { eventId } = req.params;
    
    if (!eventId) {
      return res.status(400).json({ error: '일정 ID가 필요합니다' });
    }
    
    const calendar = getCalendarClient(accessToken);
    
    // 이벤트 삭제
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
      sendUpdates: 'all' // 참석자에게 알림
    });
    
    console.log('[캘린더] 일정 삭제 성공');
    
    res.json({
      success: true,
      message: '일정이 삭제되었습니다'
    });
  } catch (error) {
    console.error('[캘린더] 일정 삭제 실패:', error.message);
    
    if (error.response) {
      console.error('[캘린더] API 응답 상태:', error.response.status);
      console.error('[캘린더] API 오류 데이터:', JSON.stringify(error.response.data).substring(0, 200));
    }
    
    res.status(500).json({ 
      error: '일정을 삭제하는 데 실패했습니다', 
      details: error.message 
    });
  }
});

// 서버 상태 확인용 헬스체크
router.get('/health', (req, res) => {
  console.log('[캘린더] 헬스체크 요청');
  
  // 액세스 토큰 유무만 확인
  const tokenStatus = req.user && req.user.accessToken ? '유효함' : '없음';
  
  res.json({
    status: 'ok',
    message: '캘린더 API 서비스 정상 작동 중',
    token: tokenStatus,
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 