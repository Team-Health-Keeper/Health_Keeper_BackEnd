const pool = require("../config/database");

/**
 * 전국 동호회/클럽 목록 조회 (페이지네이션 + 통합검색 + 종목필터)
 *
 * @route   GET /api/clubs
 * @desc    club_info 테이블에서 조건에 맞는 동호회 정보를 페이지 단위로 조회
 *          파라미터가 없으면 전체 목록 중 첫 페이지 반환
 *
 * @query   {number} [page=1]      - 페이지 번호 (1부터 시작)
 * @query   {number} [limit=20]    - 페이지당 항목 수 (기본 20개)
 * @query   {string} [keyword]     - 통합 검색어 (동호회명, 시도명, 시군구명에서 검색)
 * @query   {string} [category]    - 종목 카테고리 필터 (러닝, 요가, 헬스, 등산, 수영, 사이클 등)
 *
 * @returns {object} { success, count, totalCount, page, totalPages, hasNextPage, data }
 */
const getAllClubs = async (req, res) => {
  try {
    // 페이지네이션 파라미터 (기본값: page=1, limit=20)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // 검색 파라미터 추출
    const { keyword, category } = req.query;

    // WHERE 조건절 구성
    let whereClause = "WHERE 1=1";
    const params = [];

    // 통합 검색어 - 동호회명, 시도명, 시군구명에서 부분 일치 검색 (OR 조건)
    if (keyword) {
      whereClause += ` AND (
        CLUB_NM LIKE ? OR 
        CTPRVN_NM LIKE ? OR 
        SIGNGU_NM LIKE ?
      )`;
      const keywordParam = `%${keyword}%`;
      params.push(keywordParam, keywordParam, keywordParam);
    }

    // 종목 카테고리 필터 (버튼 클릭 시)
    if (category) {
      whereClause += " AND ITEM_NM LIKE ?";
      params.push(`%${category}%`);
    }

    // 전체 개수 조회 (페이지네이션 정보용)
    const countQuery = `SELECT COUNT(*) AS total FROM club_info ${whereClause}`;
    const [[{ total: totalCount }]] = await pool.query(countQuery, params);

    // 데이터 조회 쿼리 (DB 컬럼명을 camelCase로 매핑)
    const dataQuery = `
      SELECT 
        id,
        CLUB_NM AS clubName,
        CTPRVN_NM AS sidoName,
        SIGNGU_NM AS sigunguName,
        ITEM_NM AS itemName,
        ITEM_CL_NM AS itemClassName,
        SEXDSTN_FLAG_NM AS genderType,
        MBER_CO AS memberCount,
        FOND_DE AS foundedDate,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM club_info 
      ${whereClause}
      LIMIT ? OFFSET ?
    `;

    // 페이지네이션 파라미터 추가
    const dataParams = [...params, limit, offset];
    const [rows] = await pool.query(dataQuery, dataParams);

    // 총 페이지 수 계산
    const totalPages = Math.ceil(totalCount / limit);

    // 성공 응답 (결과 없음일 때도 200 반환)
    res.json({
      success: true,
      count: rows.length,
      totalCount,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      data: rows,
    });
  } catch (error) {
    console.error("동호회 조회 오류:", error);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
    });
  }
};

module.exports = {
  getAllClubs,
};
