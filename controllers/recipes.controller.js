const pool = require("../config/database");
const jwt = require("jsonwebtoken");

// video_duration 파싱 유틸리티 함수 (measurement.controller.js와 동일)
const parseVideoDuration = (durationStr) => {
  if (!durationStr) return 0;
  const parts = durationStr.split(":").map((p) => parseInt(p) || 0);

  if (parts.length === 3) {
    if (parts[0] >= 60) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      return parts[0] * 60 + parts[1];
    }
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
};

/**
 * 레시피 목록 조회
 * GET /api/recipes?page=1&limit=10&recipe_title=검색어&for_me=Y
 * for_me=Y일 때는 JWT 인증 필요 (내 레시피만 조회)
 * for_me=N이거나 없으면 전체 레시피 조회 (로그인 불필요)
 */
const getAllRecipes = async (req, res) => {
  try {
    // 페이지네이션 파라미터 (기본값: page=1, limit=10)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // 검색 파라미터 추출
    const { recipe_title, for_me } = req.query;

    // for_me 파라미터 처리
    let userId = null;
    if (for_me === "Y") {
      // JWT 토큰에서 사용자 ID 추출
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        return res.status(401).json({
          success: false,
          message: "내 레시피 조회를 위해서는 로그인이 필요합니다.",
        });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;

        // 사용자 존재 확인
        const [users] = await pool.execute("SELECT * FROM users WHERE id = ?", [
          userId,
        ]);
        if (users.length === 0) {
          return res.status(401).json({
            success: false,
            message: "유효하지 않은 사용자입니다.",
          });
        }
      } catch (error) {
        if (error.name === "JsonWebTokenError") {
          return res.status(401).json({
            success: false,
            message: "유효하지 않은 토큰입니다.",
          });
        }
        if (error.name === "TokenExpiredError") {
          return res.status(401).json({
            success: false,
            message: "토큰이 만료되었습니다.",
          });
        }
        throw error;
      }
    }

    // WHERE 조건절 구성
    let whereClause = "WHERE 1=1";
    const params = [];

    // 내 레시피만 조회 (for_me=Y일 때)
    if (for_me === "Y" && userId) {
      whereClause += " AND user_id = ?";
      params.push(userId);
    }

    // 레시피 제목 검색 (부분 일치)
    if (recipe_title) {
      whereClause += " AND recipe_title LIKE ?";
      params.push(`%${recipe_title}%`);
    }

    // 전체 개수 조회 (페이지네이션 정보용)
    const countQuery = `SELECT COUNT(*) AS total FROM recipe ${whereClause}`;
    const [[{ total: totalCount }]] = await pool.query(countQuery, params);

    // 데이터 조회 쿼리 (최신순 정렬)
    const dataQuery = `
      SELECT 
        id,
        recipe_title,
        recipe_intro,
        difficulty,
        duration_min,
        warm_up_cards,
        main_cards,
        cool_down_cards,
        created_at
      FROM recipe 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    // 페이지네이션 파라미터 추가
    const dataParams = [...params, limit, offset];
    const [rows] = await pool.query(dataQuery, dataParams);

    // 카드 개수 계산 함수
    const countCards = (cardsString) => {
      if (!cardsString || cardsString.trim() === "") return 0;
      const cardIds = cardsString
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "");
      // 중복 제거하여 고유한 카드 개수 반환
      return new Set(cardIds).size;
    };

    // 응답 데이터 포맷팅
    const formattedData = rows.map((recipe) => {
      const warmUpCount = countCards(recipe.warm_up_cards);
      const mainCount = countCards(recipe.main_cards);
      const coolDownCount = countCards(recipe.cool_down_cards);
      const cardCount = warmUpCount + mainCount + coolDownCount;

      return {
        id: recipe.id,
        recipe_title: recipe.recipe_title,
        recipe_intro: recipe.recipe_intro,
        difficulty: recipe.difficulty,
        duration_min: recipe.duration_min,
        card_count: cardCount,
      };
    });

    // 총 페이지 수 계산
    const totalPages = Math.ceil(totalCount / limit);

    // 성공 응답
    res.json({
      success: true,
      count: formattedData.length,
      totalCount,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      data: formattedData,
    });
  } catch (error) {
    console.error("레시피 목록 조회 오류:", error);
    res.status(500).json({
      success: false,
      message: "레시피 목록 조회 중 오류가 발생했습니다.",
    });
  }
};

/**
 * 운동 목록 조회 (공개 API - 로그인 불필요)
 * GET /api/recipes/:id
 */
const getRecipeExercises = async (req, res) => {
  try {
    const recipeId = parseInt(req.params.id);

    if (!recipeId || isNaN(recipeId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 레시피 ID입니다.",
      });
    }

    // 레시피 조회
    const [recipes] = await pool.execute(
      `SELECT 
        recipe_title,
        recipe_intro,
        difficulty,
        duration_min,
        warm_up_cards,
        main_cards,
        cool_down_cards
      FROM recipe WHERE id = ?`,
      [recipeId]
    );

    if (recipes.length === 0) {
      return res.status(404).json({
        success: false,
        message: "레시피를 찾을 수 없습니다.",
      });
    }

    const recipe = recipes[0];

    // 카드 ID 배열 추출 함수 (각 카테고리 내에서만 중복 제거)
    const getAllCardIds = (cardsString) => {
      if (!cardsString || cardsString.trim() === "") return [];
      const ids = cardsString
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "");
      return [...new Set(ids)];
    };

    // 카드 개수 계산 함수
    const countCards = (cardsString) => {
      if (!cardsString || cardsString.trim() === "") return 0;
      const cardIds = cardsString
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "");
      // 각 카테고리 내에서만 중복 제거하여 고유한 카드 개수 반환
      return new Set(cardIds).size;
    };

    const warmUpCardIds = getAllCardIds(recipe.warm_up_cards);
    const mainCardIds = getAllCardIds(recipe.main_cards);
    const coolDownCardIds = getAllCardIds(recipe.cool_down_cards);

    // 카드 개수 계산 (각 카테고리별로 계산 후 합산)
    const warmUpCount = countCards(recipe.warm_up_cards);
    const mainCount = countCards(recipe.main_cards);
    const coolDownCount = countCards(recipe.cool_down_cards);
    const cardCount = warmUpCount + mainCount + coolDownCount;

    // 카드 포맷팅 함수
    const formatCard = (card) => ({
      exercise_name: card.exercise_name || "",
      description: card.description || "",
      video_url: card.video_url || "",
      image_url: card.image_url || "",
      video_duration: parseVideoDuration(card.video_duration), // 초 단위로 반환
      fitness_category: card.fitness_category || "",
      equipment: card.equipment || "",
      body_part: card.body_part || "",
      target_audience: card.target_audience || "",
    });

    // 각 카테고리별 카드 조회 함수
    const getCardsByIds = async (cardIds) => {
      if (cardIds.length === 0) return [];
      const placeholders = cardIds.map(() => "?").join(",");
      const [cards] = await pool.execute(
        `SELECT 
          exercise_name,
          description,
          video_url,
          image_url,
          video_duration,
          fitness_category,
          equipment,
          body_part,
          target_audience
        FROM card 
        WHERE id IN (${placeholders}) 
        ORDER BY FIELD(id, ${placeholders})`,
        [...cardIds, ...cardIds]
      );
      return cards.map(formatCard);
    };

    // 각 카테고리별로 카드 조회
    const warmUpCards = await getCardsByIds(warmUpCardIds);
    const mainCards = await getCardsByIds(mainCardIds);
    const coolDownCards = await getCardsByIds(coolDownCardIds);

    res.json({
      success: true,
      recipe_title: recipe.recipe_title || "",
      recipe_intro: recipe.recipe_intro || "",
      difficulty: recipe.difficulty || "",
      duration_min: recipe.duration_min || 0,
      card_count: cardCount,
      warm_up_cards: warmUpCards,
      main_cards: mainCards,
      cool_down_cards: coolDownCards,
    });
  } catch (error) {
    console.error("운동 목록 조회 오류:", error);
    res.status(500).json({
      success: false,
      message: "운동 목록 조회 중 오류가 발생했습니다.",
    });
  }
};

module.exports = {
  getAllRecipes,
  getRecipeExercises,
};
