const express = require('express');
const router = express.Router();
const mypageController = require('../controllers/mypage.controller');
const authenticate = require('../middleware/auth');

// 마이페이지 종합 정보 조회 (인증 필요)
// GET /api/mypage
router.get('/', authenticate, mypageController.getMyPage);

module.exports = router;
