const express = require('express');
const router = express.Router();
const sportsFacilitiesController = require('../controllers/sportsFacilities.controller');

// 주변 체육시설 조회 (위치 기반, 반경 내 거리순)
// GET /api/sports-facilities/nearby?lat=37.497942&lng=127.027621&radius=5&facilityType=수영장
router.get('/nearby', sportsFacilitiesController.getNearbyFacilities);

// 체육시설 통합 검색 (페이지네이션 + 키워드 + 카테고리)
// GET /api/sports-facilities?keyword=강남&category=헬스장&page=1&limit=20&lat=37.497942&lng=127.027621
router.get('/', sportsFacilitiesController.getAllFacilities);

module.exports = router;
