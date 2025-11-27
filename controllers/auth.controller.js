const axios = require("axios");
const pool = require("../config/database");
const jwt = require("jsonwebtoken");

// 공통 인증 처리 함수 (로그인/회원가입 자동 처리)
// provider, provider_id로 기존 사용자 확인 후 없으면 생성, 있으면 반환
// JWT 토큰 생성 및 반환
const authenticateUser = async (provider, providerId, email, name) => {
  // 1. 기존 사용자 확인
  const [existingUsers] = await pool.execute(
    "SELECT * FROM users WHERE provider = ? AND provider_id = ?",
    [provider, providerId]
  );

  let user;
  if (existingUsers.length > 0) {
    // 기존 사용자
    user = existingUsers[0];
    // 이메일이나 이름이 업데이트되었을 수 있으므로 업데이트
    if (email !== user.email || name !== user.name) {
      await pool.execute("UPDATE users SET email = ?, name = ? WHERE id = ?", [
        email || user.email,
        name || user.name,
        user.id,
      ]);
      // 업데이트된 사용자 정보 다시 조회
      const [updatedUsers] = await pool.execute(
        "SELECT * FROM users WHERE id = ?",
        [user.id]
      );
      user = updatedUsers[0];
    }
  } else {
    // 새 사용자 생성
    const [result] = await pool.execute(
      "INSERT INTO users (provider, provider_id, email, name) VALUES (?, ?, ?, ?)",
      [provider, providerId, email, name]
    );
    const [newUsers] = await pool.execute("SELECT * FROM users WHERE id = ?", [
      result.insertId,
    ]);
    user = newUsers[0];
  }

  // 2. JWT 토큰 생성
  const token = jwt.sign(
    {
      id: user.id,
      provider: user.provider,
      provider_id: user.provider_id,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );

  // 3. 반환값 구성
  return {
    token,
    email: user.email,
    name: user.name,
  };
};

// 카카오 인증 URL 생성
const getKakaoAuthUrl = (req, res) => {
  const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID;

  if (!KAKAO_CLIENT_ID) {
    return res.status(500).json({
      success: false,
      message:
        "카카오 클라이언트 ID가 설정되지 않았습니다. .env 파일을 확인하세요.",
    });
  }

  // 백엔드로 리다이렉트 (백엔드가 처리 후 프론트엔드로 리다이렉트)
  const REDIRECT_URI =
    process.env.KAKAO_REDIRECT_URI ||
    process.env.BACKEND_URL + "/api/auth/kakao/callback" ||
    "http://localhost:3001/api/auth/kakao/callback";

  // 리다이렉트 URI 인코딩 (정확한 일치 필요)
  const encodedRedirectUri = encodeURIComponent(REDIRECT_URI);

  // 필요한 scope 설정 (닉네임과 이메일만)
  const scope = "profile_nickname account_email";
  const encodedScope = encodeURIComponent(scope);

  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodedRedirectUri}&response_type=code&scope=${encodedScope}`;

  console.log("카카오 인증 URL 생성:", {
    clientId: KAKAO_CLIENT_ID ? "설정됨" : "없음",
    redirectUri: REDIRECT_URI,
    encodedRedirectUri: encodedRedirectUri,
    scope: scope,
    encodedScope: encodedScope,
    fullUrl: kakaoAuthUrl,
  });

  res.json({
    success: true,
    authUrl: kakaoAuthUrl,
  });
};

// 카카오 콜백 처리
const kakaoCallback = async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: "카카오 로그인 취소 또는 오류 발생",
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "인증 코드가 없습니다",
      });
    }

    // 1. 카카오 액세스 토큰 발급
    const tokenResponse = await axios.post(
      "https://kauth.kakao.com/oauth/token",
      null,
      {
        params: {
          grant_type: "authorization_code",
          client_id: process.env.KAKAO_CLIENT_ID,
          client_secret: process.env.KAKAO_CLIENT_SECRET,
          redirect_uri:
            process.env.KAKAO_REDIRECT_URI ||
            process.env.BACKEND_URL + "/api/auth/kakao/callback" ||
            "http://localhost:3001/api/auth/kakao/callback",
          code: code,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
      }
    );

    const { access_token } = tokenResponse.data;

    // 2. 카카오 사용자 정보 가져오기
    const userInfoResponse = await axios.get(
      "https://kapi.kakao.com/v2/user/me",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const kakaoUser = userInfoResponse.data;
    const providerId = kakaoUser.id.toString();

    // 카카오 사용자 정보 추출
    // 이메일: account_email scope 필요
    const email = kakaoUser.kakao_account?.email || null;

    // 닉네임: profile_nickname scope 필요
    const nickname =
      kakaoUser.kakao_account?.profile?.nickname ||
      kakaoUser.properties?.nickname ||
      null;

    // 닉네임 사용 (실명 불필요)
    const name = nickname || `카카오사용자${providerId.slice(-4)}`;

    console.log("카카오 사용자 정보:", {
      email: email || "이메일 없음 (account_email scope 필요)",
      nickname: nickname || "닉네임 없음 (profile_nickname scope 필요)",
      name: name, // 최종 사용할 이름 (닉네임)
      providerId,
      hasEmail: !!email,
      hasNickname: !!nickname,
    });

    // 3. 공통 authenticateUser 함수 사용
    const result = await authenticateUser("kakao", providerId, email, name);

    // 4. React 프론트엔드로 리다이렉트 (토큰 포함)
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(
      `${frontendUrl}/auth/callback?token=${result.token}&success=true&email=${email}&name=${name}`
    );
  } catch (error) {
    console.error("카카오 로그인 오류:", error.response?.data || error.message);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(
      `${frontendUrl}/auth/callback?success=false&error=${encodeURIComponent(
        error.message
      )}`
    );
  }
};

// 현재 로그인한 사용자 정보 조회
const getMe = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "토큰이 없습니다",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await pool.execute("SELECT * FROM users WHERE id = ?", [
      decoded.id,
    ]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다",
      });
    }

    const user = users[0];
    // 비밀번호 같은 민감한 정보 제외
    res.json({
      success: true,
      user: {
        id: user.id,
        provider: user.provider,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        message: "유효하지 않은 토큰입니다",
      });
    }

    res.status(500).json({
      success: false,
      message: "서버 오류",
    });
  }
};

// 인증 API (로그인/회원가입 자동 처리)
const authenticate = async (req, res) => {
  try {
    const { provider, provider_id, email, name } = req.body;

    // 입력값 검증
    if (!provider || !provider_id) {
      return res.status(400).json({
        success: false,
        message: "provider와 provider_id는 필수입니다",
      });
    }

    // provider 유효성 검증
    const validProviders = ["kakao", "google", "naver"];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        success: false,
        message: `지원하지 않는 provider입니다. 지원: ${validProviders.join(
          ", "
        )}`,
      });
    }

    // 공통 authenticateUser 함수 사용
    const result = await authenticateUser(
      provider,
      provider_id,
      email || null,
      name
    );

    res.json({
      success: true,
      token: result.token,
      email: result.email,
      name: result.name,
    });
  } catch (error) {
    console.error("인증 오류:", error);
    res.status(500).json({
      success: false,
      message: "인증 중 오류가 발생했습니다",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 로그아웃 (클라이언트에서 토큰 삭제)
const logout = (req, res) => {
  res.json({
    success: true,
    message: "로그아웃되었습니다",
  });
};

module.exports = {
  getKakaoAuthUrl,
  kakaoCallback,
  authenticate,
  getMe,
  logout,
};
