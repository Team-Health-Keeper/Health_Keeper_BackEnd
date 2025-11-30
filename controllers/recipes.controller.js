const pool = require("../config/database");

/**
 * 레시피 목록 조회 (공개 API - 로그인 불필요)
 * GET /api/recipes?page=1&limit=20&recipe_title=검색어
 */
const getAllRecipes = async (req, res) => {
  try {
    // 페이지네이션 파라미터 (기본값: page=1, limit=20)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // 검색 파라미터 추출
    const { recipe_title } = req.query;

    // WHERE 조건절 구성
    let whereClause = "WHERE 1=1";
    const params = [];

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

module.exports = {
  getAllRecipes,
};
