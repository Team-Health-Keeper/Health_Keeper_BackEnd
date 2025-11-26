# 국민체력지키미 (Health Keeper) - Backend API

국민체육진흥공단 공공데이터 활용 경진대회를 위한 AI 웹 프로젝트의 백엔드 API 서버입니다.

## ✨ 주요 기능

- RESTful API 구조
- 보안 미들웨어 (Helmet)
- CORS 지원
- 요청 로깅 (Morgan)
- 환경 변수 설정
- 에러 핸들링
- Health check 엔드포인트

## 🔧 필요 사항

- Node.js (v14 이상)
- npm

## 📦 설치 및 실행

1. 프로젝트 디렉토리로 이동:

```bash
cd Health_Keeper_BackEnd
```

2. 의존성 설치:

```bash
npm install
```

3. 환경 변수 파일 생성:

```bash
cp env.example .env
```

4. `.env` 파일에서 포트 등 설정 (필요시)

5. 서버 실행:

```bash
# 개발 모드 (자동 재시작)
npm run dev

# 프로덕션 모드
npm start
```

서버는 `http://localhost:3000`에서 실행됩니다.

## 📁 프로젝트 구조

```
Health_Keeper_BackEnd/
├── server.js              # 서버 진입점
├── package.json           # 의존성 및 스크립트
├── routes/                # API 라우트
├── controllers/           # 컨트롤러
├── middleware/            # 미들웨어
├── config/                # 설정 파일
├── models/                # 데이터 모델
├── services/              # 비즈니스 로직
└── utils/                 # 유틸리티
```

## 🔌 API 엔드포인트

### Health Check

- **GET** `/api/health` - 서버 상태 확인

### Root

- **GET** `/` - API 서버 정보

## 🛠 사용 기술

- Node.js, Express.js
- CORS, Helmet, Morgan
- dotenv, express-validator

## 📝 개발 가이드

### 새 라우트 추가

1. `routes/` 디렉토리에 파일 생성:

```javascript
const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ success: true });
});

module.exports = router;
```

2. `server.js`에 등록:

```javascript
app.use("/api/example", require("./routes/example.routes"));
```

### 에러 처리

```javascript
const err = new Error("에러 메시지");
err.statusCode = 400;
throw err;
```

### 로깅

```javascript
const logger = require("../utils/logger");
logger.info("정보 메시지");
logger.error("에러 메시지");
```

---

문의사항이 있으면 개발팀에 연락해주세요.
