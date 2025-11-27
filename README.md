# 국민체력지키미 (Health Keeper) - Backend API

국민체육진흥공단 공공데이터 활용 경진대회를 위한 AI 웹 프로젝트의 백엔드 API 서버입니다.

## ✨ 주요 기능

- RESTful API 구조
- 카카오 소셜 로그인
- JWT 토큰 기반 인증
- 체력 측정 및 AI 운동 레시피 생성
- MySQL 데이터베이스 연동
- 보안 미들웨어 (Helmet, CORS)

## 🔧 필요 사항

- Node.js (v14 이상)
- npm
- MySQL (v5.7 이상)

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

4. `.env` 파일 설정 (카카오 API 키, DB 정보 등)

5. 서버 실행:

```bash
# 개발 모드 (자동 재시작)
npm run dev

# 프로덕션 모드
npm start
```

서버는 `http://localhost:3001`에서 실행됩니다.

## 📁 프로젝트 구조

```
Health_Keeper_BackEnd/
├── server.js              # 서버 진입점
├── package.json           # 의존성 및 스크립트
├── routes/                # API 라우트
│   ├── health.routes.js
│   ├── auth.routes.js
│   └── measurement.routes.js
├── controllers/           # 컨트롤러
│   ├── auth.controller.js
│   └── measurement.controller.js
├── middleware/            # 미들웨어
│   └── auth.js
├── config/                # 설정 파일
│   └── database.js
├── services/              # 비즈니스 로직
│   └── ai.service.js
└── utils/                 # 유틸리티
    └── logger.js
```

## 🔌 API 엔드포인트

### Base URL

```
http://localhost:3001/api
```

---

## 1. Health Check

### GET `/api/health`

서버 상태 확인

**요청:**

```bash
GET http://localhost:3001/api/health
```

**응답:**

```json
{
  "success": true,
  "message": "Health check passed",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

---

## 2. 인증 (Authentication)

### 2.1 인증 (로그인/회원가입)

프론트엔드에서 소셜 로그인 정보를 전송하여 사용자를 인증하고 JWT 토큰을 발급받습니다. 기존 사용자는 자동으로 로그인되고, 새 사용자는 자동으로 회원가입됩니다.

**요청:**

```bash
POST http://localhost:3001/api/auth/authenticate
Content-Type: application/json

{
  "provider": "kakao",
  "provider_id": "123456789",
  "email": "user@example.com",
  "name": "홍길동"
}
```

**요청 파라미터:**

| 파라미터      | 타입   | 필수 | 설명                                     |
| ------------- | ------ | ---- | ---------------------------------------- |
| `provider`    | string | ✅   | 로그인 유형 (`kakao`, `google`, `naver`) |
| `provider_id` | string | ✅   | 소셜 로그인 고유 아이디                  |
| `email`       | string | ❌   | 이메일 (옵션, 공백 가능)                 |
| `name`        | string | ❌   | 성명 또는 닉네임 (없으면 닉네임도 가능)  |

**응답:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "email": "user@example.com",
  "name": "홍길동"
}
```

**응답 파라미터:**

| 파라미터  | 타입    | 설명      |
| --------- | ------- | --------- |
| `success` | boolean | 성공 여부 |
| `token`   | string  | JWT 토큰  |
| `email`   | string  | 이메일    |
| `name`    | string  | 성명      |

**에러 응답:**

```json
{
  "success": false,
  "message": "provider와 provider_id는 필수입니다"
}
```

**cURL 예제:**

```bash
curl -X POST http://localhost:3001/api/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "kakao",
    "provider_id": "123456789",
    "email": "user@example.com",
    "name": "홍길동"
  }'
```

**JavaScript 예제:**

```javascript
const response = await fetch("http://localhost:3001/api/auth/authenticate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    provider: "kakao",
    provider_id: "123456789",
    email: "user@example.com",
    name: "홍길동",
  }),
});

const data = await response.json();
console.log(data.token); // JWT 토큰
```

**동작 방식:**

1. `provider` + `provider_id` 조합으로 기존 사용자 확인
2. 기존 사용자가 있으면 → 로그인 처리 (토큰 발급)
3. 기존 사용자가 없으면 → 회원가입 처리 (생성 후 토큰 발급)
4. JWT 토큰 생성 및 반환

---

### 2.2 카카오 로그인 URL 가져오기

### GET `/api/auth/kakao`

카카오 로그인 인증 URL 반환

**요청:**

```bash
GET http://localhost:3001/api/auth/kakao
```

**응답:**

```json
{
  "success": true,
  "authUrl": "https://kauth.kakao.com/oauth/authorize?client_id=..."
}
```

**사용 예시:**

```javascript
const response = await fetch("http://localhost:3001/api/auth/kakao");
const { authUrl } = await response.json();
window.location.href = authUrl;
```

---

### 2.2 카카오 로그인 콜백

### GET `/api/auth/kakao/callback`

카카오 로그인 후 콜백 처리 (자동 리다이렉트)

**요청:**

```
GET http://localhost:3001/api/auth/kakao/callback?code=AUTHORIZATION_CODE
```

**응답:**

- 성공: 프론트엔드로 리다이렉트
  ```
  http://localhost:3000/auth/callback?token=JWT_TOKEN&success=true
  ```
- 실패: 에러와 함께 리다이렉트
  ```
  http://localhost:3000/auth/callback?success=false&error=ERROR_MESSAGE
  ```

---

### 2.3 현재 사용자 정보 조회

### GET `/api/auth/me`

JWT 토큰으로 현재 로그인한 사용자 정보 조회

**요청 헤더:**

```
Authorization: Bearer {JWT_TOKEN}
```

**요청:**

```bash
GET http://localhost:3001/api/auth/me
Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**응답:**

```json
{
  "success": true,
  "user": {
    "id": 1,
    "provider": "kakao",
    "email": "user@example.com",
    "name": "홍길동",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**에러 응답:**

```json
{
  "success": false,
  "message": "유효하지 않은 토큰입니다"
}
```

**사용 예시:**

```javascript
const token = localStorage.getItem("token");
const response = await fetch("http://localhost:3001/api/auth/me", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
const data = await response.json();
```

---

### 2.4 로그아웃

### POST `/api/auth/logout`

로그아웃 (클라이언트에서 토큰 삭제)

**요청:**

```bash
POST http://localhost:3001/api/auth/logout
```

**응답:**

```json
{
  "success": true,
  "message": "로그아웃되었습니다"
}
```

---

## 3. 체력 측정 및 운동 레시피

### 3.1 체력 측정 및 레시피 생성

### POST `/api/measurement`

체력 측정 정보를 입력하고 AI 서버를 호출하여 운동 레시피 생성

**요청 헤더:**

```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**요청 Body:**

```json
{
  "height": 170, // 키 (cm) - 필수
  "weight": 70, // 몸무게 (kg) - 필수
  "age": 25, // 나이 - 필수
  "gender": "M", // 성별 (M/F) - 필수
  "activityLevel": "moderate", // 활동 수준 (low/moderate/high) - 선택
  "goal": "health", // 목표 (health/weight_loss/muscle_gain) - 선택
  "healthConditions": "고혈압" // 건강 상태 - 선택
}
```

**요청 예시:**

```bash
POST http://localhost:3001/api/measurement
Headers:
  Authorization: Bearer {JWT_TOKEN}
  Content-Type: application/json
Body:
{
  "height": 170,
  "weight": 70,
  "age": 25,
  "gender": "M",
  "activityLevel": "moderate",
  "goal": "health"
}
```

**응답:**

```json
{
  "success": true,
  "message": "체력 측정 및 운동 레시피가 생성되었습니다.",
  "data": {
    "measurement": {
      "id": 1,
      "measurement_data": {
        "height": 170,
        "weight": 70,
        "age": 25,
        "gender": "M",
        "activityLevel": "moderate",
        "goal": "health"
      }
    },
    "recipe": {
      "id": 1,
      "measurement_id": 1,
      "category_id": 1,
      "recipe_title": "건강 유지 맞춤 운동 프로그램",
      "recipe_intro": "BMI 24.2 기준으로 건강 유지에 효과적인 운동 프로그램입니다.",
      "difficulty": "초급",
      "duration_min": 30,
      "fitness_grade": "보통",
      "fitness_score": 50,
      "exercise_cards": [
        {
          "id": 1,
          "exercise_name": "스트레칭",
          "description": "전신 근육 이완 및 유연성 향상",
          "duration": 10
        },
        {
          "id": 2,
          "exercise_name": "유산소 운동",
          "description": "심폐 기능 향상 및 칼로리 소모",
          "duration": 20
        }
      ],
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**에러 응답:**

```json
{
  "success": false,
  "message": "키, 몸무게, 나이, 성별은 필수 입력 항목입니다."
}
```

**사용 예시:**

```javascript
const token = localStorage.getItem("token");
const response = await fetch("http://localhost:3001/api/measurement", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    height: 170,
    weight: 70,
    age: 25,
    gender: "M",
    activityLevel: "moderate",
    goal: "health",
  }),
});
const data = await response.json();
```

---

### 3.2 측정 기록 조회

### GET `/api/measurement`

사용자의 모든 측정 기록 조회

**요청 헤더:**

```
Authorization: Bearer {JWT_TOKEN}
```

**요청:**

```bash
GET http://localhost:3001/api/measurement
Headers:
  Authorization: Bearer {JWT_TOKEN}
```

**응답:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "measurement_data": {
        "height": 170,
        "weight": 70,
        "age": 25,
        "gender": "M"
      },
      "recipe_id": 1,
      "recipe_title": "건강 유지 맞춤 운동 프로그램",
      "fitness_score": 50,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 3.3 특정 측정 기록 조회

### GET `/api/measurement/:id`

특정 측정 기록 상세 조회

**요청 헤더:**

```
Authorization: Bearer {JWT_TOKEN}
```

**요청:**

```bash
GET http://localhost:3001/api/measurement/1
Headers:
  Authorization: Bearer {JWT_TOKEN}
```

**응답:**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "user_id": 1,
    "measurement_data": {
      "height": 170,
      "weight": 70,
      "age": 25,
      "gender": "M",
      "activityLevel": "moderate",
      "goal": "health"
    },
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 3.4 레시피 조회

### GET `/api/measurement/:id/recipe`

특정 측정 기록의 운동 레시피 조회

**요청 헤더:**

```
Authorization: Bearer {JWT_TOKEN}
```

**요청:**

```bash
GET http://localhost:3001/api/measurement/1/recipe
Headers:
  Authorization: Bearer {JWT_TOKEN}
```

**응답:**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "measurement_id": 1,
    "category_id": 1,
    "recipe_title": "건강 유지 맞춤 운동 프로그램",
    "recipe_intro": "BMI 24.2 기준으로 건강 유지에 효과적인 운동 프로그램입니다.",
    "difficulty": "초급",
    "duration_min": 30,
    "fitness_grade": "보통",
    "fitness_score": 50,
    "exercise_cards": [
      {
        "id": 1,
        "exercise_name": "스트레칭",
        "description": "전신 근육 이완 및 유연성 향상",
        "duration": 10
      }
    ],
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## 🔐 인증 (Authentication)

대부분의 API는 JWT 토큰 인증이 필요합니다.

**인증이 필요한 API:**

- `GET /api/auth/me`
- `POST /api/measurement`
- `GET /api/measurement`
- `GET /api/measurement/:id`
- `GET /api/measurement/:id/recipe`

**인증 방법:**

```
Authorization: Bearer {JWT_TOKEN}
```

**토큰 획득:**

1. 카카오 로그인 완료 후 프론트엔드 콜백에서 토큰 받기
2. `localStorage` 또는 쿠키에 저장
3. API 호출 시 헤더에 포함

---

## ⚙️ 환경 변수 설정

`.env` 파일 설정:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=health_keeper
DB_USER=root
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Kakao OAuth Configuration
KAKAO_CLIENT_ID=your_kakao_rest_api_key
KAKAO_CLIENT_SECRET=your_kakao_client_secret
KAKAO_REDIRECT_URI=http://localhost:3001/api/auth/kakao/callback

# Frontend URL (React)
FRONTEND_URL=http://localhost:3000

# AI Server Configuration
AI_SERVER_URL=http://localhost:8000
```

---

## 🛠 사용 기술

- **Node.js** - JavaScript 런타임
- **Express.js** - 웹 프레임워크
- **MySQL2** - MySQL 데이터베이스 드라이버
- **JWT** - JSON Web Token 인증
- **Axios** - HTTP 클라이언트
- **CORS** - Cross-Origin Resource Sharing
- **Helmet** - 보안 미들웨어
- **Morgan** - HTTP 요청 로거
- **dotenv** - 환경 변수 관리

---

## 📝 에러 코드

| HTTP 상태 코드 | 설명                  |
| -------------- | --------------------- |
| 200            | 성공                  |
| 201            | 생성 성공             |
| 400            | 잘못된 요청           |
| 401            | 인증 필요             |
| 403            | 권한 없음             |
| 404            | 리소스를 찾을 수 없음 |
| 500            | 서버 오류             |

---

## 🔍 테스트 방법

### cURL 예시

```bash
# Health Check
curl http://localhost:3001/api/health

# 카카오 로그인 URL
curl http://localhost:3001/api/auth/kakao

# 사용자 정보 조회 (토큰 필요)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/api/auth/me

# 체력 측정
curl -X POST http://localhost:3001/api/measurement \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "height": 170,
    "weight": 70,
    "age": 25,
    "gender": "M"
  }'
```

---

## 📄 라이선스

ISC

---

문의사항이 있으면 개발팀에 연락해주세요.
