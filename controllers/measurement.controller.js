const pool = require("../config/database");
const aiService = require("../services/ai.service");
const { getAgeGroup, getMeasurementItems } = require("../utils/ageGroups");

// 체력 측정 정보 입력 및 AI 레시피 생성
const createMeasurement = async (req, res) => {
  try {
    const userId = req.user.id;
    const { measurements } = req.body; // [{measure_key: "1", measure_value: "170"}, ...]

    // 입력 검증
    if (
      !measurements ||
      !Array.isArray(measurements) ||
      measurements.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "측정 항목이 필요합니다. [{measure_key: string, measure_value: string}, ...] 형식으로 전송해주세요.",
      });
    }

    // 측정 항목을 객체 형태로 변환
    const processedItems = {};
    let age = null;
    let gender = null;

    measurements.forEach((item) => {
      if (
        !item.measure_key ||
        item.measure_value === undefined ||
        item.measure_value === null ||
        item.measure_value === ""
      ) {
        return; // 유효하지 않은 항목은 건너뛰기
      }

      const key = String(item.measure_key);
      const value = String(item.measure_value);

      // 나이와 성별을 measurements에서 추출 (measurement_code 테이블의 코드 사용)
      // 나이: "53" (measurement_code 테이블)
      // 성별: "54" (measurement_code 테이블)
      // 호환성을 위해 "age", "gender"도 지원
      if (key === "53" || key === "age") {
        age = parseInt(value);
        processedItems[key] = value; // 측정 항목에도 포함
      } else if (key === "54" || key === "gender") {
        gender =
          value === "male" || value === "M"
            ? "M"
            : value === "female" || value === "F"
            ? "F"
            : value;
        processedItems[key] = value; // 측정 항목에도 포함
      } else {
        processedItems[key] = value;
      }
    });

    // 나이와 성별이 없으면 기본값 사용 (AI 서버 호출을 위해)
    if (!age) {
      age = 30; // 기본값
    }
    if (!gender) {
      gender = "M"; // 기본값
    }

    // 연령대 판단
    const determinedAgeGroup = getAgeGroup(age);
    const ageGroupInfo = getMeasurementItems(determinedAgeGroup);

    // 필수 항목 확인 (신장, 체중)
    const requiredItems = ageGroupInfo.required || ["1", "2"];
    const hasRequired = requiredItems.every(
      (key) => processedItems[key] !== undefined && processedItems[key] !== null
    );

    if (!hasRequired) {
      return res.status(400).json({
        success: false,
        message: `필수 측정 항목이 누락되었습니다. (${
          ageGroupInfo.items[requiredItems[0]]
        }, ${ageGroupInfo.items[requiredItems[1]]})`,
      });
    }

    // 측정 세션 UUID 생성 (YYYYMMDD0001 형식)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const datePrefix = `${year}${month}${day}`;

    // 오늘 날짜의 기존 측정 세션 수 확인
    const [existingMeasurements] = await pool.execute(
      `SELECT measurement_UUID 
       FROM measurement 
       WHERE user_id = ? AND measurement_UUID LIKE ?
       GROUP BY measurement_UUID`,
      [userId, `${datePrefix}%`]
    );

    // 오늘 날짜의 순번 결정 (기존 세션 수 + 1)
    const sequenceNumber = String(existingMeasurements.length + 1).padStart(
      4,
      "0"
    );
    const measurementUUID = `${datePrefix}${sequenceNumber}`;

    // 1. 각 측정 항목별로 별도의 행으로 저장
    const insertedMeasurementIds = [];

    // 각 측정 항목별로 행 삽입
    for (const [measurementCode, value] of Object.entries(processedItems)) {
      if (value !== null && value !== "" && value !== undefined) {
        const [result] = await pool.execute(
          "INSERT INTO measurement (user_id, measurement_UUID, measurement_code, measurement_data) VALUES (?, ?, ?, ?)",
          [userId, measurementUUID, measurementCode, String(value)]
        );
        insertedMeasurementIds.push(result.insertId);
      }
    }

    // measurement_UUID를 measurement.id로 사용 (recipe 테이블과의 연결을 위해)
    // 첫 번째 삽입된 measurement의 ID를 사용
    const measurementId =
      insertedMeasurementIds.length > 0 ? insertedMeasurementIds[0] : null;

    // 2. AI 서버 호출 (레시피 생성)
    const aiResponse = await aiService.generateRecipe({
      ageGroup: determinedAgeGroup,
      age: age,
      gender,
      activityLevel: "moderate", // 기본값
      goal: "health", // 기본값
      healthConditions: null,
      measurementItems: processedItems,
    });

    // 3. 레시피 정보 DB 저장
    // DDL에 따르면 recipe 테이블 구조:
    // - user_id, measurement_UUID, recipe_title, recipe_intro, difficulty, duration_min, fitness_grade, fitness_score, cards
    const [recipeResult] = await pool.execute(
      `INSERT INTO recipe (
        user_id,
        measurement_UUID, 
        recipe_title, 
        recipe_intro, 
        difficulty, 
        duration_min, 
        fitness_grade, 
        fitness_score, 
        cards
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        measurementId, // measurement_UUID는 measurement.id를 사용
        aiResponse.recipeTitle || "맞춤 운동 레시피",
        aiResponse.recipeIntro || "AI가 추천하는 맞춤형 운동 프로그램입니다.",
        aiResponse.difficulty || "중급",
        aiResponse.durationMin || 30,
        aiResponse.fitnessGrade || "B",
        aiResponse.fitnessScore || 0,
        JSON.stringify(aiResponse.exerciseCards || []), // 운동 카드 목록을 cards 컬럼에 저장
      ]
    );

    const recipeId = recipeResult.insertId;

    // 4. 저장된 레시피 조회
    const [recipes] = await pool.execute(
      `SELECT r.* FROM recipe r WHERE r.id = ?`,
      [recipeId]
    );

    const recipe = recipes[0];
    // cards 컬럼을 exercise_cards로 변환 (프론트엔드 호환성)
    if (recipe.cards) {
      try {
        recipe.exercise_cards = JSON.parse(recipe.cards);
      } catch (e) {
        recipe.exercise_cards = [];
      }
    } else {
      recipe.exercise_cards = [];
    }

    // 측정 데이터 조회 (measurement_UUID로 모든 측정 항목 가져오기)
    const [allMeasurements] = await pool.execute(
      `SELECT measurement_code, measurement_data 
       FROM measurement 
       WHERE measurement_UUID = ?
       ORDER BY measurement_code ASC`,
      [measurementUUID]
    );

    // 측정 데이터를 객체 형태로 변환
    const measurementDataObj = {};
    allMeasurements.forEach((m) => {
      measurementDataObj[m.measurement_code] = m.measurement_data;
    });

    res.status(201).json({
      success: true,
      message: "체력 측정 및 운동 레시피가 생성되었습니다.",
      data: {
        measurement: {
          id: measurementId,
          measurement_UUID: measurementUUID,
          measurement_data: {
            ageGroup: determinedAgeGroup,
            age: age,
            gender,
            activityLevel: "moderate",
            goal: "health",
            healthConditions: null,
            measurementItems: measurementDataObj,
          },
        },
        recipe: recipe,
      },
    });
  } catch (error) {
    console.error("체력 측정 생성 오류:", error);
    res.status(500).json({
      success: false,
      message: error.message || "체력 측정 생성 중 오류가 발생했습니다.",
    });
  }
};

// 사용자의 측정 기록 조회
const getMeasurements = async (req, res) => {
  try {
    const userId = req.user.id;

    const [measurements] = await pool.execute(
      `SELECT m.*, r.id as recipe_id, r.recipe_title, r.fitness_score
       FROM measurement m
       LEFT JOIN recipe r ON m.id = r.measurement_UUID
       WHERE m.user_id = ?
       ORDER BY m.created_at DESC`,
      [userId]
    );

    // JSON 파싱
    const formattedMeasurements = measurements.map((m) => ({
      ...m,
      measurement_data: JSON.parse(m.measurement_data),
    }));

    res.json({
      success: true,
      data: formattedMeasurements,
    });
  } catch (error) {
    console.error("측정 기록 조회 오류:", error);
    res.status(500).json({
      success: false,
      message: "측정 기록 조회 중 오류가 발생했습니다.",
    });
  }
};

// 특정 측정 기록 조회
const getMeasurementById = async (req, res) => {
  try {
    const userId = req.user.id;
    const measurementId = req.params.id;

    const [measurements] = await pool.execute(
      `SELECT * FROM measurement 
       WHERE id = ? AND user_id = ?`,
      [measurementId, userId]
    );

    if (measurements.length === 0) {
      return res.status(404).json({
        success: false,
        message: "측정 기록을 찾을 수 없습니다.",
      });
    }

    const measurement = measurements[0];
    measurement.measurement_data = JSON.parse(measurement.measurement_data);

    res.json({
      success: true,
      data: measurement,
    });
  } catch (error) {
    console.error("측정 기록 조회 오류:", error);
    res.status(500).json({
      success: false,
      message: "측정 기록 조회 중 오류가 발생했습니다.",
    });
  }
};

// 레시피 조회
const getRecipe = async (req, res) => {
  try {
    const userId = req.user.id;
    const measurementId = req.params.id;

    // 측정 기록이 해당 사용자의 것인지 확인
    const [measurements] = await pool.execute(
      `SELECT m.user_id FROM measurement m WHERE m.id = ?`,
      [measurementId]
    );

    if (measurements.length === 0) {
      return res.status(404).json({
        success: false,
        message: "측정 기록을 찾을 수 없습니다.",
      });
    }

    if (measurements[0].user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "권한이 없습니다.",
      });
    }

    // 레시피 조회
    const [recipes] = await pool.execute(
      `SELECT r.* FROM recipe r WHERE r.measurement_UUID = ?`,
      [measurementId]
    );

    if (recipes.length === 0) {
      return res.status(404).json({
        success: false,
        message: "레시피를 찾을 수 없습니다.",
      });
    }

    const recipe = recipes[0];
    // cards 컬럼을 exercise_cards로 변환 (프론트엔드 호환성)
    if (recipe.cards) {
      try {
        recipe.exercise_cards = JSON.parse(recipe.cards);
      } catch (e) {
        recipe.exercise_cards = [];
      }
    } else {
      recipe.exercise_cards = [];
    }

    res.json({
      success: true,
      data: recipe,
    });
  } catch (error) {
    console.error("레시피 조회 오류:", error);
    res.status(500).json({
      success: false,
      message: "레시피 조회 중 오류가 발생했습니다.",
    });
  }
};

// 측정정보코드조회 (모든 측정 코드 목록)
const getMeasurementCodes = async (req, res) => {
  try {
    const [codes] = await pool.execute(
      `SELECT id, measurement_code_name, guide_video 
       FROM measurement_code 
       ORDER BY measurement_code_name ASC`
    );

    res.json({
      success: true,
      data: codes,
    });
  } catch (error) {
    console.error("측정정보코드조회 오류:", error);
    res.status(500).json({
      success: false,
      message: "측정정보코드조회 중 오류가 발생했습니다.",
    });
  }
};

module.exports = {
  createMeasurement,
  getMeasurements,
  getMeasurementById,
  getRecipe,
  getMeasurementCodes,
};
