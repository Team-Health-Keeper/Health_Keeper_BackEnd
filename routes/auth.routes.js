const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const authenticate = require("../middleware/auth");

// 인증 (로그인/회원가입 자동 처리)
router.post("/authenticate", authController.authenticate);

// 카카오 로그인 시작 (카카오 인증 URL 반환)
router.get("/kakao", authController.getKakaoAuthUrl);

// 카카오 콜백 처리
router.get("/kakao/callback", authController.kakaoCallback);

// 로그인 상태 확인 (JWT 검증)
router.get("/me", authenticate, authController.getMe);

// 로그아웃 (인증 선택적 - 토큰이 없어도 성공 처리, 클라이언트에서 토큰 삭제)
// 토큰이 있으면 사용자 정보를 기록하고, 없어도 로그아웃은 성공으로 처리
router.post("/logout", async (req, res, next) => {
  // 인증을 시도하지만 실패해도 계속 진행
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: decoded.id };
    } catch (error) {
      // 토큰이 유효하지 않아도 무시하고 계속 진행
    }
  }
  next();
}, authController.logout);

module.exports = router;
