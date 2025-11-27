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

  // 2. 오늘 날짜의 grass_history 기록 확인 및 삽입
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD 형식
  try {
    // 오늘 날짜에 대한 기록이 있는지 확인
    const [existingRecords] = await pool.execute(
      "SELECT * FROM grass_history WHERE user_id = ? AND record_date = ?",
      [user.id, today]
    );

    if (existingRecords.length === 0) {
      // 오늘 날짜에 기록이 없으면 새로 삽입 (로그인 = 출석)
      await pool.execute(
        "INSERT INTO grass_history (user_id, attendance, video_watch, measurement, record_date) VALUES (?, ?, ?, ?, ?)",
        [user.id, "Y", "N", "N", today]
      );
      console.log(
        `[grass_history] 로그인 기록 추가: user_id=${user.id}, date=${today}`
      );
    } else {
      // 이미 기록이 있으면 출석만 업데이트 (이미 'Y'일 수도 있음)
      await pool.execute(
        "UPDATE grass_history SET attendance = ? WHERE user_id = ? AND record_date = ?",
        ["Y", user.id, today]
      );
      console.log(
        `[grass_history] 로그인 출석 업데이트: user_id=${user.id}, date=${today}`
      );
    }
  } catch (error) {
    // grass_history 삽입 실패해도 로그인은 계속 진행
    console.error("[grass_history] 기록 삽입 오류:", error);
  }

  // 3. JWT 토큰 생성
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

  // 4. 반환값 구성
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

// 네이버 콜백 처리
const naverCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    console.log("[네이버 콜백] 요청 받음:", {
      code: code ? "있음" : "없음",
      state: state || "없음",
      error: error || "없음",
      query: req.query,
    });

    if (error) {
      console.error("[네이버 콜백] 에러:", error);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      return res.redirect(
        `${frontendUrl}/auth/callback?success=false&error=${encodeURIComponent(
          "네이버 로그인 취소 또는 오류 발생"
        )}`
      );
    }

    if (!code) {
      console.error("[네이버 콜백] 인증 코드 없음");
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      return res.redirect(
        `${frontendUrl}/auth/callback?success=false&error=${encodeURIComponent(
          "인증 코드가 없습니다"
        )}`
      );
    }

    // redirect_uri는 프론트엔드에서 사용한 것과 정확히 일치해야 함
    const redirectUri =
      process.env.NAVER_REDIRECT_URI ||
      process.env.BACKEND_URL + "/api/auth/naver/callback" ||
      "http://localhost:3001/api/auth/naver/callback";

    console.log("[네이버 콜백] 토큰 교환 시작:", {
      redirectUri: redirectUri,
      clientId: process.env.NAVER_CLIENT_ID ? "설정됨" : "없음",
      clientSecret: process.env.NAVER_CLIENT_SECRET ? "설정됨" : "없음",
      code: code ? "있음" : "없음",
      state: state || "없음",
    });

    // 1. 네이버 액세스 토큰 발급
    // 네이버 API는 application/x-www-form-urlencoded 형식의 body를 요구함
    const querystring = require("querystring");
    const tokenRequestData = querystring.stringify({
      grant_type: "authorization_code",
      client_id: process.env.NAVER_CLIENT_ID,
      client_secret: process.env.NAVER_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code: code,
      state: state,
    });

    console.log("[네이버 콜백] 토큰 요청 데이터:", {
      grant_type: "authorization_code",
      client_id: process.env.NAVER_CLIENT_ID ? "설정됨" : "없음",
      client_secret: process.env.NAVER_CLIENT_SECRET ? "설정됨" : "없음",
      redirect_uri: redirectUri,
      code: code ? "있음" : "없음",
      state: state || "없음",
    });

    let tokenResponse;
    try {
      tokenResponse = await axios.post(
        "https://nid.naver.com/oauth2.0/token",
        tokenRequestData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          },
        }
      );
    } catch (tokenError) {
      console.error("[네이버 콜백] 토큰 교환 실패:", {
        status: tokenError.response?.status,
        statusText: tokenError.response?.statusText,
        data: tokenError.response?.data,
        message: tokenError.message,
      });
      throw new Error(
        tokenError.response?.data?.error_description ||
          tokenError.response?.data?.error ||
          `네이버 토큰 교환 실패: ${tokenError.message}`
      );
    }

    console.log("[네이버 콜백] 토큰 응답:", {
      status: tokenResponse.status,
      data: tokenResponse.data,
      hasAccessToken: !!tokenResponse.data.access_token,
      responseKeys: Object.keys(tokenResponse.data),
    });

    // 네이버 API는 에러를 200 응답으로 반환할 수 있음
    if (tokenResponse.data.error) {
      console.error("[네이버 콜백] 토큰 응답 에러:", tokenResponse.data);
      throw new Error(
        tokenResponse.data.error_description ||
          tokenResponse.data.error ||
          "네이버 토큰 교환 실패"
      );
    }

    const { access_token } = tokenResponse.data;

    if (!access_token) {
      console.error("[네이버 콜백] 액세스 토큰 없음:", tokenResponse.data);
      throw new Error(
        `액세스 토큰을 받지 못했습니다. 응답: ${JSON.stringify(
          tokenResponse.data
        )}`
      );
    }

    // 2. 네이버 사용자 정보 가져오기
    console.log("[네이버 콜백] 사용자 정보 조회 시작");
    const userInfoResponse = await axios.get(
      "https://openapi.naver.com/v1/nid/me",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    console.log("[네이버 콜백] 사용자 정보 응답:", {
      hasResponse: !!userInfoResponse.data.response,
      responseData: userInfoResponse.data,
    });

    const naverUser = userInfoResponse.data.response;

    if (!naverUser) {
      throw new Error("네이버 사용자 정보를 받지 못했습니다");
    }

    const providerId = naverUser.id;

    if (!providerId) {
      throw new Error("네이버 사용자 ID를 받지 못했습니다");
    }

    // 네이버 사용자 정보 추출
    const email = naverUser.email || null;
    const name =
      naverUser.name ||
      naverUser.nickname ||
      `네이버사용자${providerId.slice(-4)}`;

    console.log("네이버 사용자 정보:", {
      email: email || "이메일 없음",
      name: name,
      providerId,
    });

    // 3. 공통 authenticateUser 함수 사용
    console.log("[네이버 콜백] 사용자 인증 시작:", {
      providerId,
      email: email || "없음",
      name,
    });

    const result = await authenticateUser("naver", providerId, email, name);

    console.log("[네이버 콜백] 사용자 인증 완료:", {
      hasToken: !!result.token,
      email: result.email || "없음",
      name: result.name || "없음",
    });

    // 4. 프론트엔드로 리다이렉트 (토큰 포함)
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const redirectUrl = `${frontendUrl}/auth/callback?token=${
      result.token
    }&success=true&email=${encodeURIComponent(
      email || ""
    )}&name=${encodeURIComponent(name)}`;

    console.log("[네이버 콜백] 프론트엔드로 리다이렉트:", redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("[네이버 콜백] 오류 상세:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack,
    });
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const errorMessage =
      error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.message ||
      "네이버 로그인 중 오류가 발생했습니다";
    res.redirect(
      `${frontendUrl}/auth/callback?success=false&error=${encodeURIComponent(
        errorMessage
      )}`
    );
  }
};

// 구글 콜백 처리
const googleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      return res.redirect(
        `${frontendUrl}/auth/callback?success=false&error=${encodeURIComponent(
          "구글 로그인 취소 또는 오류 발생"
        )}`
      );
    }

    if (!code) {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      return res.redirect(
        `${frontendUrl}/auth/callback?success=false&error=${encodeURIComponent(
          "인증 코드가 없습니다"
        )}`
      );
    }

    // 1. 구글 액세스 토큰 발급
    // redirect_uri는 프론트엔드에서 사용한 것과 정확히 일치해야 함
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      process.env.BACKEND_URL + "/api/auth/google/callback" ||
      "http://localhost:3001/api/auth/google/callback";

    console.log("구글 토큰 교환:", {
      redirectUri: redirectUri,
      code: code ? "있음" : "없음",
    });

    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      null,
      {
        params: {
          grant_type: "authorization_code",
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          code: code,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = tokenResponse.data;

    // 2. 구글 사용자 정보 가져오기
    const userInfoResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const googleUser = userInfoResponse.data;
    const providerId = googleUser.id;

    // 구글 사용자 정보 추출
    const email = googleUser.email || null;
    const name =
      googleUser.name ||
      googleUser.given_name ||
      `구글사용자${providerId.slice(-4)}`;

    console.log("구글 사용자 정보:", {
      email: email || "이메일 없음",
      name: name,
      providerId,
    });

    // 3. 공통 authenticateUser 함수 사용
    const result = await authenticateUser("google", providerId, email, name);

    // 4. 프론트엔드로 리다이렉트 (토큰 포함)
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(
      `${frontendUrl}/auth/callback?token=${
        result.token
      }&success=true&email=${encodeURIComponent(
        email || ""
      )}&name=${encodeURIComponent(name)}`
    );
  } catch (error) {
    console.error("구글 로그인 오류:", error.response?.data || error.message);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(
      `${frontendUrl}/auth/callback?success=false&error=${encodeURIComponent(
        error.message || "구글 로그인 중 오류가 발생했습니다"
      )}`
    );
  }
};

// 로그아웃 (클라이언트에서 토큰 삭제)
// JWT는 stateless이므로 서버에서 토큰을 무효화할 수 없지만,
// 로그아웃 요청을 받아서 로그를 남기고 성공 응답을 반환합니다.
// 실제 토큰 삭제는 클라이언트에서 처리합니다.
// 인증이 실패해도 로그아웃은 성공으로 처리합니다.
const logout = async (req, res) => {
  try {
    // 인증된 사용자 정보가 있으면 로그에 기록 (없어도 정상)
    const userId = req.user?.id;
    if (userId) {
      console.log(`[logout] 사용자 로그아웃: user_id=${userId}`);
    } else {
      console.log(`[logout] 로그아웃 요청 (인증 정보 없음)`);
    }

    res.json({
      success: true,
      message: "로그아웃되었습니다",
    });
  } catch (error) {
    console.error("로그아웃 오류:", error);
    // 로그아웃은 항상 성공으로 처리 (클라이언트에서 토큰 삭제)
    res.json({
      success: true,
      message: "로그아웃되었습니다",
    });
  }
};

module.exports = {
  getKakaoAuthUrl,
  kakaoCallback,
  naverCallback,
  googleCallback,
  authenticate,
  getMe,
  logout,
};
