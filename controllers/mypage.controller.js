const pool = require('../config/database');

/**
 * 배지 달성 조건 체크 및 badge_info 업데이트
 * badge_info 형식: "1,3,5" (달성한 배지 ID를 콤마로 구분)
 *
 * 배지 조건:
 * 1: 🔥 7일 연속 출석
 * 2: ⭐ A등급 달성
 * 3: 🏆 전체 상위 2%
 * 4: 💪 30일 완주 (총 출석 30일 이상)
 * 5: 🎯 체력측정 3회 이상
 * 6: 👑 프리미엄 회원
 */
const updateBadgeInfo = async (userId, userData) => {
  const earnedBadges = [];

  // 1. 연속 출석 계산 (7일 연속)
  const [streakRows] = await pool.query(
    `SELECT record_date, attendance 
     FROM grass_history 
     WHERE user_id = ? 
     ORDER BY record_date DESC`,
    [userId]
  );

  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < streakRows.length; i++) {
    const recordDate = new Date(streakRows[i].record_date);
    recordDate.setHours(0, 0, 0, 0);

    const expectedDate = new Date(today);
    expectedDate.setDate(today.getDate() - i);

    // 날짜가 연속인지 확인
    if (
      recordDate.getTime() === expectedDate.getTime() &&
      streakRows[i].attendance === 'Y'
    ) {
      currentStreak++;
    } else {
      break;
    }
  }

  if (currentStreak >= 7) {
    earnedBadges.push('1');
  }

  // 2. A등급 체크
  if (
    userData.fitness_grade &&
    userData.fitness_grade.toUpperCase().startsWith('A')
  ) {
    earnedBadges.push('2');
  }

  // 3. 전체 상위 2% 체크
  const [[rankResult]] = await pool.query(
    `SELECT 
      (SELECT COUNT(*) FROM users WHERE fitness_score > ?) + 1 AS userRank,
      (SELECT COUNT(*) FROM users WHERE fitness_score IS NOT NULL) AS totalUsers`,
    [userData.fitness_score || 0]
  );

  const topPercent =
    rankResult.totalUsers > 0
      ? Math.round((rankResult.userRank / rankResult.totalUsers) * 100)
      : 100;

  if (topPercent <= 2) {
    earnedBadges.push('3');
  }

  // 4. 30일 완주 (총 출석 30일 이상)
  const [[attendanceResult]] = await pool.query(
    `SELECT COUNT(*) AS totalAttendance 
     FROM grass_history 
     WHERE user_id = ? AND attendance = 'Y'`,
    [userId]
  );

  if (attendanceResult.totalAttendance >= 30) {
    earnedBadges.push('4');
  }

  // 5. 체력측정 3회 이상
  const [[measurementResult]] = await pool.query(
    `SELECT COUNT(*) AS totalMeasurement 
     FROM grass_history 
     WHERE user_id = ? AND measurement = 'Y'`,
    [userId]
  );

  if (measurementResult.totalMeasurement >= 3) {
    earnedBadges.push('5');
  }

  // 6. 프리미엄 회원 체크
  if (userData.is_premium === 1 || userData.is_premium === true) {
    earnedBadges.push('6');
  }

  // badge_info 업데이트
  const badgeInfoStr = earnedBadges.join(',');

  await pool.query(
    `INSERT INTO mypage (user_id, badge_info) 
     VALUES (?, ?) 
     ON DUPLICATE KEY UPDATE badge_info = ?`,
    [userId, badgeInfoStr, badgeInfoStr]
  );

  return {
    badgeInfo: badgeInfoStr,
    currentStreak,
    topPercent,
    totalAttendance: attendanceResult.totalAttendance,
    totalMeasurement: measurementResult.totalMeasurement,
    rankData: rankResult,
  };
};

/**
 * 마이페이지 종합 정보 조회
 *
 * @route   GET /api/mypage
 * @desc    프로필, 순위, 배지, 잔디, 추천 레시피 등 마이페이지 전체 데이터 반환
 * @access  Private (인증 필요)
 */
const getMyPage = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. 사용자 정보 조회
    const [[userData]] = await pool.query(
      `SELECT id, name, email, fitness_grade, fitness_score, is_premium, created_at 
       FROM users 
       WHERE id = ?`,
      [userId]
    );

    if (!userData) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.',
      });
    }

    // 2. 배지 조건 체크 및 업데이트
    const badgeResult = await updateBadgeInfo(userId, userData);

    // 3. 이번 주 영상 시청 횟수
    const [[weeklyVideoResult]] = await pool.query(
      `SELECT COUNT(*) AS weeklyVideoWatch 
       FROM grass_history 
       WHERE user_id = ? 
         AND video_watch = 'Y' 
         AND record_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`,
      [userId]
    );

    // 4. 잔디 데이터 (최근 1년)
    const [grassData] = await pool.query(
      `SELECT 
         record_date AS recordDate,
         attendance,
         video_watch AS videoWatch,
         measurement
       FROM grass_history 
       WHERE user_id = ? 
         AND record_date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
       ORDER BY record_date ASC`,
      [userId]
    );

    // 잔디 데이터 변환 (Y/N → true/false)
    const formattedGrass = grassData.map((row) => ({
      recordDate: row.recordDate,
      attendance: row.attendance === 'Y',
      videoWatch: row.videoWatch === 'Y',
      measurement: row.measurement === 'Y',
    }));

    // 5. 추천 레시피 (최근 4개)
    const [recipes] = await pool.query(
      `SELECT 
         id,
         recipe_title AS recipeTitle,
         recipe_intro AS recipeIntro,
         difficulty,
         duration_min AS durationMin,
         fitness_grade AS fitnessGrade,
         warm_up_cards AS warmUpCards,
         main_cards AS mainCards,
         cool_down_cards AS coolDownCards,
         created_at AS createdAt
       FROM recipe 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 4`,
      [userId]
    );

    // 레시피 운동 개수 계산
    const formattedRecipes = recipes.map((recipe) => {
      let exerciseCount = 0;
      try {
        const warmUp = recipe.warmUpCards
          ? recipe.warmUpCards.split(',').length
          : 0;
        const main = recipe.mainCards ? recipe.mainCards.split(',').length : 0;
        const coolDown = recipe.coolDownCards
          ? recipe.coolDownCards.split(',').length
          : 0;
        exerciseCount = warmUp + main + coolDown;
      } catch (e) {
        exerciseCount = 0;
      }
      return {
        ...recipe,
        exerciseCount,
      };
    });

    // 응답
    res.json({
      success: true,
      data: {
        profile: {
          userId: userData.id,
          name: userData.name,
          email: userData.email,
          fitnessGrade: userData.fitness_grade,
          fitnessScore: userData.fitness_score,
        },
        ranking: {
          totalUsers: badgeResult.rankData.totalUsers,
          userRank: badgeResult.rankData.userRank,
          topPercent: badgeResult.topPercent,
        },
        streak: {
          currentStreak: badgeResult.currentStreak,
        },
        badgeInfo: badgeResult.badgeInfo,
        weeklyVideoWatch: weeklyVideoResult.weeklyVideoWatch,
        grass: formattedGrass,
        recipes: formattedRecipes,
      },
    });
  } catch (error) {
    console.error('마이페이지 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
    });
  }
};

module.exports = {
  getMyPage,
};
