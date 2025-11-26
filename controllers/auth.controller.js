const axios = require("axios");
const pool = require("../config/database");
const jwt = require("jsonwebtoken");

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

  // 프론트엔드 URL을 기본값으로 사용 (카카오는 프론트엔드로 리다이렉트)
  const REDIRECT_URI =
    process.env.KAKAO_REDIRECT_URI ||
    process.env.FRONTEND_URL + "/auth/callback" ||
    "http://localhost:3000/auth/callback";

  // 리다이렉트 URI 인코딩 (정확한 일치 필요)
  const encodedRedirectUri = encodeURIComponent(REDIRECT_URI);
  // scope 제거 - 기본 권한만 사용
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodedRedirectUri}&response_type=code`;

  console.log("카카오 인증 URL 생성:", {
    clientId: KAKAO_CLIENT_ID ? "설정됨" : "없음",
    redirectUri: REDIRECT_URI,
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
            process.env.FRONTEND_URL + "/auth/callback" ||
            "http://localhost:3000/auth/callback",
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
    // 이메일: OpenID Connect 활성화 시 받을 수 있음
    const email =
      kakaoUser.kakao_account?.email ||
      kakaoUser.kakao_account?.email_needs_agreement
        ? null
        : null;

    // 이름: 실명 우선, 없으면 닉네임 사용
    const realName = kakaoUser.kakao_account?.name || null; // 실명
    const nickname =
      kakaoUser.kakao_account?.profile?.nickname ||
      kakaoUser.properties?.nickname ||
      null; // 닉네임

    // 실명이 있으면 실명 사용, 없으면 닉네임 사용
    const name = realName || nickname || `카카오사용자${providerId.slice(-4)}`;

    console.log("카카오 사용자 정보:", {
      email: email || "이메일 없음 (OpenID Connect 활성화 필요)",
      realName: realName || "실명 없음",
      nickname: nickname || "닉네임 없음",
      name: name, // 최종 사용할 이름 (실명 우선)
      providerId,
      hasEmail: !!email,
      hasRealName: !!realName,
      hasNickname: !!nickname,
    });

    // 3. DB에서 사용자 조회 또는 생성
    let user;
    const [existingUsers] = await pool.execute(
      "SELECT * FROM users WHERE provider = ? AND provider_id = ?",
      ["kakao", providerId]
    );

    if (existingUsers.length > 0) {
      // 기존 사용자
      user = existingUsers[0];
    } else {
      // 새 사용자 생성
      const [result] = await pool.execute(
        "INSERT INTO users (provider, provider_id, email, name) VALUES (?, ?, ?, ?)",
        ["kakao", providerId, email, name]
      );
      const [newUsers] = await pool.execute(
        "SELECT * FROM users WHERE id = ?",
        [result.insertId]
      );
      user = newUsers[0];
    }

    // 4. JWT 토큰 발급
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

    // 5. React 프론트엔드로 리다이렉트 (토큰 포함)
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(`${frontendUrl}/auth/callback?token=${token}&success=true`);
  } catch (error) {
    console.error("카카오 로그인 오류:", error.response?.data || error.message);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
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
  getMe,
  logout,
};
