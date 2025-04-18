require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');

// 디버깅 로그 추가
console.log('서버 시작 중...');
console.log('노드 버전:', process.version);
console.log('현재 작업 디렉토리:', process.cwd());

// 라우트 임포트
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3002;

// 환경 변수 로깅 (민감 정보 제외)
console.log("환경 변수:", {
  PORT: process.env.PORT,
  CLIENT_URL: process.env.CLIENT_URL,
  REDIRECT_URI: process.env.REDIRECT_URI,
  NODE_ENV: process.env.NODE_ENV,
  HAS_GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
  HAS_GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
  HAS_OPENAI_API_KEY: !!process.env.OPENAI_API_KEY
});

// CORS 설정 - 좀 더 유연하게
const corsOptions = {
  origin: function (origin, callback) {
    // 모든 원본 허용 (개발 환경)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// JWT 비밀키
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 3600000 // 1시간
  }
}));

// 정적 파일 제공
app.use(express.static('public'));

// 토큰 리프레시 작업 (필요시 액세스 토큰 갱신)
const refreshTokenIfNeeded = async (req, res, next) => {
  // 토큰이 없으면 진행
  if (!req.user || !req.user.accessToken) {
    return next();
  }
  
  // 토큰 만료 시간 확인
  const now = Date.now();
  const tokenExpiry = req.user.tokenExpiry;
  
  // 토큰이 만료되었거나 5분 이내에 만료될 예정인 경우
  if (tokenExpiry && now > tokenExpiry - 300000) {
    console.log('액세스 토큰 만료 임박 또는 만료됨, 갱신 시도...');
    
    // 리프레시 토큰이 있는 경우에만 시도
    if (req.user.refreshToken) {
      try {
        const oauth2Client = new OAuth2Client(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.REDIRECT_URI
        );
        
        // 리프레시 토큰 설정
        oauth2Client.setCredentials({
          refresh_token: req.user.refreshToken
        });
        
        // 새 액세스 토큰 요청
        const { credentials } = await oauth2Client.refreshAccessToken();
        console.log('토큰 갱신 성공:', credentials.access_token ? '있음' : '없음');
        
        // 새 JWT 토큰 생성
        const newToken = jwt.sign(
          {
            ...req.user,
            accessToken: credentials.access_token,
            tokenExpiry: credentials.expiry_date
          },
          JWT_SECRET,
          { expiresIn: '1h' }
        );
        
        // 쿠키 업데이트
        res.cookie('token', newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 3600000 // 1시간
        });
        
        // 요청 객체 업데이트
        req.user.accessToken = credentials.access_token;
        req.user.tokenExpiry = credentials.expiry_date;
        
        console.log('토큰 갱신 및 쿠키 업데이트 완료');
      } catch (error) {
        console.error('토큰 갱신 실패:', error.message);
        // 갱신 실패해도 기존 토큰으로 계속 진행
      }
    }
  }
  
  next();
};

// JWT 인증 미들웨어
const authenticateToken = (req, res, next) => {
  console.log('인증 미들웨어 실행. 헤더:', req.headers.authorization);
  console.log('쿠키:', req.cookies);
  
  // 1. 쿠키에서 토큰 가져오기 시도
  const cookieToken = req.cookies.token;
  
  // 2. 헤더에서 토큰 가져오기 시도 (Bearer 토큰)
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  
  // 사용할 토큰 결정 (쿠키 우선)
  const token = cookieToken || headerToken;
  
  if (!token) {
    console.error('인증 토큰이 없음');
    return res.status(401).json({ 
      error: '로그인이 필요합니다',
      details: '인증 토큰이 제공되지 않았습니다'
    });
  }
  
  // 토큰 검증
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('토큰 검증 실패:', err.message);
      return res.status(403).json({ 
        error: '인증이 만료되었습니다',
        details: err.message
      });
    }
    
    console.log('인증 성공. 사용자:', user.email);
    console.log('액세스 토큰:', user.accessToken ? '있음' : '없음');
    
    req.user = user;
    next();
  });
};

// 라우트 설정
app.use('/api/auth', authRoutes);
app.use('/api/calendar', authenticateToken, refreshTokenIfNeeded, calendarRoutes);
app.use('/api/chat', authenticateToken, refreshTokenIfNeeded, chatRoutes);

// 루트 라우트
app.get('/', (req, res) => {
  console.log('루트 경로 요청 받음');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// CORS 오류 전용 미들웨어
app.use((err, req, res, next) => {
  if (err.message.includes('CORS')) {
    console.error('CORS 오류:', err.message);
    return res.status(403).json({
      error: 'CORS 정책 위반',
      details: err.message
    });
  }
  next(err);
});

// 일반 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
  console.error('서버 오류 발생:', err);
  
  // 사용자에게 보낼 오류 메시지 (보안 고려)
  let userMessage = '서버 오류가 발생했습니다';
  let details = process.env.NODE_ENV === 'production' ? '관리자에게 문의하세요' : err.message;
  
  res.status(500).json({ error: userMessage, details });
});

// 서버 시작
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버가 ${PORT} 포트에서 실행 중입니다`);
  console.log(`스마트폰에서 접속하려면: http://<컴퓨터의IP주소>:${PORT}`);
  console.log('* 스마트폰과 컴퓨터가 같은 WiFi에 연결되어 있어야 합니다');
  console.log('* 개발 모드 로그인 버튼을 사용하여 로그인하세요');
});

// 예기치 않은 오류 처리
process.on('uncaughtException', (err) => {
  console.error('처리되지 않은 예외:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('처리되지 않은 프로미스 거부:', reason);
}); 