const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Google OAuth 클라이언트 설정
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3002/api/auth/callback';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

console.log("Auth 라우트 환경 변수:", {
  CLIENT_ID,
  REDIRECT_URI,
  JWT_SECRET: JWT_SECRET.substring(0, 10) + '...'
});

const oauth2Client = new OAuth2Client(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// 구글 로그인 URL 생성
router.get('/login', (req, res) => {
  console.log("로그인 요청 처리 중...");
  console.log("사용 중인 REDIRECT_URI:", REDIRECT_URI);
  
  // Calendar API에 필요한 정확한 스코프 설정
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar',         // 전체 읽기/쓰기 권한
    'https://www.googleapis.com/auth/calendar.events',  // 이벤트 관리
  ];
  
  console.log("요청하는 OAuth 스코프:", scopes);
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',         // 리프레시 토큰을 받기 위해 필요
    scope: scopes,
    prompt: 'consent',              // 사용자에게 항상 동의 화면을 표시
    include_granted_scopes: true    // 이미 승인된 스코프도 포함
  });
  
  console.log("생성된 인증 URL:", authUrl);
  res.json({ url: authUrl });
});

// 콜백 처리
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  
  console.log("콜백 요청 받음. 전체 URL:", req.protocol + '://' + req.get('host') + req.originalUrl);
  
  // 구글에서 에러를 반환한 경우
  if (error) {
    console.error('Google returned an error:', error);
    return res.redirect(`/?error=google_error&details=${encodeURIComponent(error)}`);
  }
  
  if (!code) {
    console.error('Authorization code is missing');
    return res.redirect('/?error=auth_code_missing');
  }
  
  console.log('코드를 토큰으로 교환 시도 중...');
  
  try {
    // 코드를 토큰으로 교환
    const { tokens } = await oauth2Client.getToken({
      code: code,
      redirect_uri: REDIRECT_URI
    });
    
    if (!tokens) {
      console.error('Failed to get tokens from code');
      return res.redirect('/?error=token_exchange_failed');
    }
    
    console.log('토큰 획득 성공:', {
      access_token: tokens.access_token ? '있음' : '없음',
      refresh_token: tokens.refresh_token ? '있음' : '없음',
      expiry_date: tokens.expiry_date,
      scope: tokens.scope
    });
    
    // OAuth 클라이언트에 토큰 설정
    oauth2Client.setCredentials(tokens);
    
    // 사용자 정보 가져오기
    console.log('사용자 정보 요청 중...');
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });
    
    const userInfo = await oauth2.userinfo.get();
    const user = userInfo.data;
    
    console.log('사용자 정보 획득:', { email: user.email, name: user.name });
    
    // Calendar API 연결 테스트
    try {
      console.log('Calendar API 연결 테스트 중...');
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      // 캘린더 목록 요청으로 권한 테스트
      const calendarResponse = await calendar.calendarList.list({
        maxResults: 1
      });
      
      const calendarCount = calendarResponse.data.items?.length || 0;
      console.log('Calendar API 연결 성공. 캘린더 수:', calendarCount);
      
      if (calendarCount > 0) {
        console.log('첫 번째 캘린더 ID:', calendarResponse.data.items[0].id);
      }
    } catch (calendarError) {
      console.error('Calendar API 연결 실패:', calendarError.message);
      
      // 오류 응답에서 상세 정보 추출
      if (calendarError.response) {
        console.error('오류 상태 코드:', calendarError.response.status);
        console.error('오류 데이터:', calendarError.response.data);
      }
      
      // 캘린더 API 실패해도 로그인 처리는 계속 진행
    }
    
    // JWT 토큰 생성
    const token = jwt.sign(
      { 
        email: user.email,
        name: user.name,
        picture: user.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date,
        scope: tokens.scope
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // 쿠키에 토큰 저장
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600000 // 1시간
    });
    
    // 클라이언트용 쿠키
    res.cookie('auth_status', 'authenticated', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600000 // 1시간
    });
    
    // 메인 페이지로 리디렉션
    res.redirect('/');
  } catch (error) {
    console.error('OAuth 콜백 오류:', error.message);
    console.error('오류 스택:', error.stack);
    
    // 상세 에러 정보 추출
    let errorDetails = 'unknown_error';
    let errorDescription = '';
    
    if (error.response && error.response.data) {
      errorDescription = error.response.data.error_description || '';
    }
    
    if (error.message.includes('invalid_grant')) {
      errorDetails = 'invalid_grant';
    } else if (error.message.includes('unauthorized_client')) {
      errorDetails = 'unauthorized_client';
    } else if (error.message.includes('access_denied')) {
      errorDetails = 'access_denied';
    } else if (error.message.includes('redirect_uri_mismatch')) {
      errorDetails = 'redirect_uri_mismatch';
      console.error('REDIRECT_URI 불일치 오류. 현재 사용 중인 URI:', REDIRECT_URI);
      console.error('Google Cloud Console에서 이 URI가 정확히 설정되어 있는지 확인하세요.');
    }
    
    return res.redirect(`/?error=auth_process_failed&details=${errorDetails}&description=${encodeURIComponent(errorDescription)}`);
  }
});

// 로그인 확인
router.get('/check', (req, res) => {
  const token = req.cookies.token;
  
  if (!token) {
    return res.status(401).json({ isLoggedIn: false });
  }
  
  try {
    const user = jwt.verify(token, JWT_SECRET);
    
    // 토큰 디버깅 로그
    console.log('[Auth] 인증된 사용자:', user.email);
    console.log('[Auth] 액세스 토큰 유무:', user.accessToken ? '있음' : '없음');
    
    if (!user.accessToken) {
      console.error('[Auth] 액세스 토큰이 없음. 재로그인 필요.');
      return res.status(401).json({ 
        isLoggedIn: false, 
        error: 'access_token_missing',
        message: '액세스 토큰이 없습니다. 다시 로그인해주세요.'
      });
    }
    
    // 토큰의 만료 시간 확인
    const now = Date.now();
    const tokenExpiry = user.tokenExpiry;
    
    if (tokenExpiry && now >= tokenExpiry) {
      console.error('[Auth] 액세스 토큰 만료됨. 재로그인 필요.');
      return res.status(401).json({ 
        isLoggedIn: false, 
        error: 'token_expired',
        message: '인증이 만료되었습니다. 다시 로그인해주세요.'
      });
    }
    
    // 토큰이 곧 만료되면 클라이언트에 알림 (5분 전)
    const expiryWarning = tokenExpiry && (tokenExpiry - now < 300000);
    
    // 클라이언트에서 사용할 인증 정보 전송
    res.json({
      isLoggedIn: true,
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture
      },
      expiryWarning: expiryWarning
    });
  } catch (error) {
    console.error('[Auth] 토큰 검증 오류:', error.message);
    // 토큰이 유효하지 않으면 쿠키 제거
    res.clearCookie('token');
    res.clearCookie('auth_status');
    res.status(401).json({ isLoggedIn: false, error: error.message });
  }
});

// 로그아웃
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('auth_status');
  res.json({ message: '로그아웃 되었습니다' });
});

module.exports = router; 