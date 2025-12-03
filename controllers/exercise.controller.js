const pool = require('../config/database');

/**
 * 운동 기록 추가/업데이트 (Upsert)
 * 같은 유저가 같은 운동(title 기준)에 대해 이미 기록이 있으면 업데이트, 없으면 새로 추가
 * POST /api/exercise
 */
const addExerciseRecord = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, averageAccuracy, exerciseDuration } = req.body;

    // 유효성 검사
    if (
      !title ||
      averageAccuracy === undefined ||
      exerciseDuration === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          '필수 필드가 누락되었습니다 (title, averageAccuracy, exerciseDuration)',
      });
    }

    // 0점이거나 0초면 등록 불가
    if (averageAccuracy <= 0 || exerciseDuration <= 0) {
      return res.status(400).json({
        success: false,
        message: '정확도 0% 또는 운동시간 0초인 기록은 등록할 수 없습니다',
      });
    }

    // 기존 기록 확인 (같은 유저, 같은 운동 title)
    const [existingRecords] = await pool.execute(
      'SELECT id FROM exercise_records WHERE user_id = ? AND title = ?',
      [userId, title]
    );

    let result;
    let isUpdate = false;

    if (existingRecords.length > 0) {
      // 기존 기록이 있으면 업데이트
      isUpdate = true;
      [result] = await pool.execute(
        `UPDATE exercise_records 
         SET average_accuracy = ?, exercise_duration = ?, created_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND title = ?`,
        [averageAccuracy, exerciseDuration, userId, title]
      );
    } else {
      // 새 기록 추가
      [result] = await pool.execute(
        `INSERT INTO exercise_records (user_id, title, average_accuracy, exercise_duration)
         VALUES (?, ?, ?, ?)`,
        [userId, title, averageAccuracy, exerciseDuration]
      );
    }

    res.status(isUpdate ? 200 : 201).json({
      success: true,
      message: isUpdate ? '기록이 업데이트되었습니다' : '기록이 등록되었습니다',
      data: {
        id: isUpdate ? existingRecords[0].id : result.insertId,
        isUpdate,
      },
    });
  } catch (error) {
    console.error('운동 기록 추가 오류:', error);
    res.status(500).json({
      success: false,
      message: '운동 기록 추가 중 오류가 발생했습니다',
    });
  }
};

/**
 * 특정 운동의 랭킹 조회 (title 기준)
 * GET /api/exercise/ranking/:title
 */
const getExerciseRanking = async (req, res) => {
  try {
    const { title } = req.params;
    const decodedTitle = decodeURIComponent(title);
    const limit = parseInt(req.query.limit) || 10;

    const [rankings] = await pool.execute(
      `SELECT 
        er.id,
        er.user_id,
        u.name as user_name,
        er.title,
        er.average_accuracy,
        er.exercise_duration,
        er.created_at,
        RANK() OVER (ORDER BY er.average_accuracy DESC, er.exercise_duration DESC) as rank_position
       FROM exercise_records er
       JOIN users u ON er.user_id = u.id
       WHERE er.title = ?
       ORDER BY er.average_accuracy DESC, er.exercise_duration DESC
       LIMIT ?`,
      [decodedTitle, limit]
    );

    res.json({
      success: true,
      data: rankings,
      count: rankings.length,
    });
  } catch (error) {
    console.error('랭킹 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '랭킹 조회 중 오류가 발생했습니다',
    });
  }
};

/**
 * 내 기록 조회 (특정 운동 title 기준)
 * GET /api/exercise/my-record/:title
 */
const getMyRecord = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title } = req.params;
    const decodedTitle = decodeURIComponent(title);

    // 내 기록 조회
    const [myRecords] = await pool.execute(
      `SELECT 
        er.id,
        er.title,
        er.average_accuracy,
        er.exercise_duration,
        er.created_at
       FROM exercise_records er
       WHERE er.user_id = ? AND er.title = ?`,
      [userId, decodedTitle]
    );

    if (myRecords.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: '등록된 기록이 없습니다',
      });
    }

    // 내 순위 조회
    const [rankResult] = await pool.execute(
      `SELECT COUNT(*) + 1 as my_rank
       FROM exercise_records
       WHERE title = ? AND average_accuracy > ?`,
      [decodedTitle, myRecords[0].average_accuracy]
    );

    // 전체 참가자 수
    const [totalResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM exercise_records WHERE title = ?`,
      [decodedTitle]
    );

    res.json({
      success: true,
      data: {
        ...myRecords[0],
        myRank: rankResult[0].my_rank,
        totalParticipants: totalResult[0].total,
      },
    });
  } catch (error) {
    console.error('내 기록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '내 기록 조회 중 오류가 발생했습니다',
    });
  }
};

/**
 * 내 모든 운동 기록 조회
 * GET /api/exercise/my-records
 */
const getAllMyRecords = async (req, res) => {
  try {
    const userId = req.user.id;

    const [records] = await pool.execute(
      `SELECT 
        er.id,
        er.title,
        er.average_accuracy,
        er.exercise_duration,
        er.created_at
       FROM exercise_records er
       WHERE er.user_id = ?
       ORDER BY er.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: records,
      count: records.length,
    });
  } catch (error) {
    console.error('내 기록 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '기록 목록 조회 중 오류가 발생했습니다',
    });
  }
};

module.exports = {
  addExerciseRecord,
  getExerciseRanking,
  getMyRecord,
  getAllMyRecords,
};
