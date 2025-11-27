const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

// 인증 (로그인/회원가입 자동 처리)
router.post("/authenticate", authController.authenticate);

// 카카오 로그인 시작 (카카오 인증 URL 반환)
router.get("/kakao", authController.getKakaoAuthUrl);

// 카카오 콜백 처리
router.get("/kakao/callback", authController.kakaoCallback);

// 로그인 상태 확인 (JWT 검증)
router.get("/me", authController.getMe);

// 로그아웃 (클라이언트에서 토큰 삭제)
router.post("/logout", authController.logout);

module.exports = router;
