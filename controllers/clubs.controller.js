const pool = require('../config/database');

// 동호회 통계 조회 (대시보드용)
const getClubStats = async (req, res) => {
  try {
    // 단일 쿼리로 세 가지 통계를 한번에 조회 (성능 최적화)
    const statsQuery = `
      SELECT 
        COUNT(*) AS activeClubs,
        COALESCE(SUM(MBER_CO), 0) AS totalMembers,
        SUM(CASE WHEN FOND_DE LIKE '2025%' THEN 1 ELSE 0 END) AS newClubs
      FROM club_info
    `;

    const [[stats]] = await pool.query(statsQuery);

    res.json({
      success: true,
      data: {
        activeClubs: Number(stats.activeClubs), // 활성 동호회 (총 데이터 수)
        totalMembers: Number(stats.totalMembers), // 전체 회원 (회원 수 합계)
        newClubs: Number(stats.newClubs), // 신규 동호회 (2025년 설립)
      },
    });
  } catch (error) {
    console.error('동호회 통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
    });
  }
};

// 모든 동호회 조회 (검색 및 필터링 가능)
const getAllClubs = async (req, res) => {
  try {
    // 페이지네이션 파라미터 (기본값: page=1, limit=20)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // 검색 파라미터 추출
    const { keyword, category } = req.query;

    // WHERE 조건절 구성
    let whereClause = 'WHERE 1=1';
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
      whereClause += ' AND ITEM_NM LIKE ?';
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
    console.error('동호회 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
    });
  }
};

module.exports = {
  getClubStats,
  getAllClubs,
};
