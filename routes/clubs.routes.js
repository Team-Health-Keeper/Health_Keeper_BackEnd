const express = require('express');
const router = express.Router();
const clubsController = require('../controllers/clubs.controller');

// 동호회 통계 조회 (대시보드용)
// GET /api/clubs/stats
router.get('/stats', clubsController.getClubStats);

// 동호회 목록 조회 (쿼리 파라미터로 필터링 가능)
// GET /api/clubs?region=서울&sport=축구&ageGroup=20대
router.get('/', clubsController.getAllClubs);

module.exports = router;
