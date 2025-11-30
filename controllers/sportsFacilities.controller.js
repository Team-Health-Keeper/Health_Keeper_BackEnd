const pool = require('../config/database');

// 모든 체육시설 조회 (검색 및 필터링 가능)
const getAllFacilities = async (req, res) => {
  try {
    // 페이지네이션 파라미터 (기본값: page=1, limit=20)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // 검색 파라미터 추출
    const { keyword, category } = req.query;
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    // WHERE 조건절 구성
    let whereClause = "WHERE (DEL_AT IS NULL OR DEL_AT = 'N')";
    const params = [];

    // 통합 검색어 - 시설명, 시도명, 시군구명, 주소에서 부분 일치 검색 (OR 조건)
    if (keyword) {
      whereClause += ` AND (
        FCLTY_NM LIKE ? OR 
        POSESN_MBY_CTPRVN_NM LIKE ? OR 
        POSESN_MBY_SIGNGU_NM LIKE ? OR
        RDNMADR_ONE_NM LIKE ?
      )`;
      const keywordParam = `%${keyword}%`;
      params.push(keywordParam, keywordParam, keywordParam, keywordParam);
    }

    // 시설 유형 카테고리 필터 (버튼 클릭 시)
    if (category) {
      whereClause += ' AND FCLTY_TY_NM LIKE ?';
      params.push(`%${category}%`);
    }

    // 전체 개수 조회 (페이지네이션 정보용)
    const countQuery = `SELECT COUNT(*) AS total FROM sports_facility ${whereClause}`;
    const [[{ total: totalCount }]] = await pool.query(countQuery, params);

    // 거리 계산 SELECT 절 구성
    let distanceSelect = '';
    let orderClause = 'ORDER BY id ASC';

    if (!isNaN(lat) && !isNaN(lng)) {
      // Haversine 공식으로 거리 계산 (km 단위)
      distanceSelect = `,
        ROUND(
          6371 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(FCLTY_LA)) * 
            COS(RADIANS(FCLTY_LO) - RADIANS(?)) + 
            SIN(RADIANS(?)) * SIN(RADIANS(FCLTY_LA))
          ), 2
        ) AS distance`;
      orderClause = 'ORDER BY distance ASC';
    }

    // 데이터 조회 쿼리 (DB 컬럼명을 camelCase로 매핑)
    const dataQuery = `
      SELECT 
        id,
        FCLTY_NM AS facilityName,
        FCLTY_TY_NM AS facilityType,
        FCLTY_STATE_VALUE AS stateValue,
        ROAD_NM_ZIP_NO AS zipCode,
        RDNMADR_ONE_NM AS addressMain,
        RDNMADR_TWO_NM AS addressDetail,
        FCLTY_TEL_NO AS telNo,
        POSESN_MBY_CTPRVN_NM AS sidoName,
        POSESN_MBY_SIGNGU_NM AS sigunguName,
        FCLTY_LA AS latitude,
        FCLTY_LO AS longitude,
        created_at AS createdAt,
        updated_at AS updatedAt
        ${distanceSelect}
      FROM sports_facility 
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    // 파라미터 구성 (거리 계산용 lat, lng 추가)
    let dataParams;
    if (!isNaN(lat) && !isNaN(lng)) {
      dataParams = [lat, lng, lat, ...params, limit, offset];
    } else {
      dataParams = [...params, limit, offset];
    }

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
    console.error('체육시설 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
    });
  }
};

// 주변 체육시설 조회 (위치 기반, 반경 내 거리순)
const getNearbyFacilities = async (req, res) => {
  try {
    // 필수 파라미터 검증
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: '위도(lat)와 경도(lng)는 필수 파라미터입니다.',
      });
    }

    // 페이지네이션 파라미터 (기본값: page=1, limit=20)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // 선택 파라미터
    const radius = parseFloat(req.query.radius) || 5;
    const { facilityType } = req.query;

    // WHERE 조건절 구성
    let whereClause = "WHERE (DEL_AT IS NULL OR DEL_AT = 'N')";
    const baseParams = [];

    // 시설 유형 필터
    if (facilityType) {
      whereClause += ' AND FCLTY_TY_NM LIKE ?';
      baseParams.push(`%${facilityType}%`);
    }

    // 전체 개수 조회 (반경 내)
    const countQuery = `
      SELECT COUNT(*) AS total FROM (
        SELECT 
          id,
          ROUND(
            6371 * ACOS(
              COS(RADIANS(?)) * COS(RADIANS(FCLTY_LA)) * 
              COS(RADIANS(FCLTY_LO) - RADIANS(?)) + 
              SIN(RADIANS(?)) * SIN(RADIANS(FCLTY_LA))
            ), 2
          ) AS distance
        FROM sports_facility
        ${whereClause}
        HAVING distance <= ?
      ) AS subquery
    `;

    const countParams = [lat, lng, lat, ...baseParams, radius];
    const [[{ total: totalCount }]] = await pool.query(countQuery, countParams);

    // Haversine 공식으로 거리 계산 및 반경 내 필터링
    const dataQuery = `
      SELECT 
        id,
        FCLTY_NM,
        FCLTY_TY_NM,
        FCLTY_STATE_VALUE,
        ROAD_NM_ZIP_NO,
        RDNMADR_ONE_NM,
        RDNMADR_TWO_NM,
        FCLTY_TEL_NO,
        POSESN_MBY_CTPRVN_NM,
        POSESN_MBY_SIGNGU_NM,
        FCLTY_LA,
        FCLTY_LO,
        ROUND(
          6371 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(FCLTY_LA)) * 
            COS(RADIANS(FCLTY_LO) - RADIANS(?)) + 
            SIN(RADIANS(?)) * SIN(RADIANS(FCLTY_LA))
          ), 2
        ) AS distance
      FROM sports_facility
      ${whereClause}
      HAVING distance <= ?
      ORDER BY distance ASC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [lat, lng, lat, ...baseParams, radius, limit, offset];
    const [rows] = await pool.query(dataQuery, dataParams);

    // 총 페이지 수 계산
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      count: rows.length,
      totalCount,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      data: rows,
      meta: {
        centerLat: lat,
        centerLng: lng,
        radius,
      },
    });
  } catch (error) {
    console.error('주변 체육시설 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
    });
  }
};

module.exports = {
  getAllFacilities,
  getNearbyFacilities,
};
