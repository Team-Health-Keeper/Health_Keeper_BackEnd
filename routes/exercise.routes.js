const express = require('express');
const router = express.Router();
const exerciseController = require('../controllers/exercise.controller');
const authenticate = require('../middleware/auth');

// 운동 기록 추가/업데이트 (인증 필요)
// POST /api/exercise
router.post('/', authenticate, exerciseController.addExerciseRecord);

// 특정 운동의 랭킹 조회 (공개) - title 기준
// GET /api/exercise/ranking/:title
router.get('/ranking/:title', exerciseController.getExerciseRanking);

// 내 기록 조회 - 특정 운동 (인증 필요) - title 기준
// GET /api/exercise/my-record/:title
router.get('/my-record/:title', authenticate, exerciseController.getMyRecord);

// 내 모든 운동 기록 조회 (인증 필요)
// GET /api/exercise/my-records
router.get('/my-records', authenticate, exerciseController.getAllMyRecords);

module.exports = router;
