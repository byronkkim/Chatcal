# ChatCal - 자연어로 일정 관리하기

ChatCal은 자연어 입력으로 Google Calendar를 간편하게 관리할 수 있는 웹 서비스입니다. 사용자가 대화형 방식으로 일정을 추가, 수정, 삭제할 수 있도록 OpenAI의 GPT와 Google Calendar API를 연동했습니다.

## 주요 기능

- 🗣️ **자연어 입력**: "내일 오후 2시에 팀 회의 추가해줘" 같은 자연어 명령으로 일정 관리
- 🔄 **실시간 처리**: 입력 즉시 Google Calendar에 반영
- 🔍 **일정 조회**: 간단한 질문으로 일정 확인 가능
- 🔐 **Google 계정 연동**: 안전한 OAuth 인증

## 기술 스택

- **프론트엔드**: HTML, CSS, JavaScript (바닐라)
- **백엔드**: Node.js, Express
- **API**: OpenAI Chat Completions API, Google Calendar API
- **인증**: Google OAuth 2.0, JWT

## 시작하기

### 사전 요구사항

- Node.js 14.x 이상
- npm 또는 yarn
- Google Cloud Console 프로젝트 (OAuth 2.0 인증 정보)
- OpenAI API 키

### 설치 방법

1. 저장소 클론:
   ```bash
   git clone https://github.com/yourusername/chatcal.git
   cd chatcal
   ```

2. 의존성 설치:
   ```bash
   npm install
   ```

3. 환경 변수 설정:
   `.env` 파일에 다음 환경 변수를 설정하세요:
   ```
   # OpenAI API
   OPENAI_API_KEY=your-openai-api-key
   
   # Google OAuth
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   REDIRECT_URI=http://localhost:3002/api/auth/callback
   
   # Server Config
   PORT=3002
   NODE_ENV=development
   CLIENT_URL=http://localhost:3002
   
   # JWT
   JWT_SECRET=your-jwt-secret-key
   SESSION_SECRET=your-session-secret-key
   ```

4. 서버 실행:
   ```bash
   npm run dev
   ```

5. 브라우저에서 `http://localhost:3002` 접속

### Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 새 프로젝트 생성
2. "API 및 서비스" > "사용자 인증 정보" > "OAuth 클라이언트 ID 만들기"
3. 애플리케이션 유형: "웹 애플리케이션"
4. 승인된 JavaScript 원본: `http://localhost:3002`
5. 승인된 리디렉션 URI: `http://localhost:3002/api/auth/callback`
6. 생성된 클라이언트 ID와 비밀번호를 `.env` 파일에 추가

## 사용 방법

1. 웹 애플리케이션 접속
2. Google 계정으로 로그인
3. 채팅창에 자연어로 일정 관리 요청 입력:
   - "내일 오후 2시에 팀 회의 추가해줘"
   - "다음 주 월요일 점심 약속 등록해줘"
   - "오늘 3시 미팅 5시로 변경해줘"
   - "다음 주 일정 보여줘"
   - "내일 팀 회의 삭제해줘"

## 라이센스

MIT License 