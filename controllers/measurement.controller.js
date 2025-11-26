const pool = require("../config/database");
const aiService = require("../services/ai.service");
const { getAgeGroup, getMeasurementItems } = require("../utils/ageGroups");

// 체력 측정 정보 입력 및 AI 레시피 생성
const createMeasurement = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      age, // 나이 (필수)
      gender, // 성별 (M/F) (필수)
      ageGroup, // 연령대 (선택, 없으면 나이로 자동 판단)
      activityLevel, // 활동 수준 (low/moderate/high)
      goal, // 목표 (weight_loss/muscle_gain/health)
      healthConditions, // 건강 상태 (선택)
      measurementItems, // 연령대별 측정 항목들 (객체 형태)
    } = req.body;

    // 기본 필수 항목 검증
    if (!age || !gender) {
      return res.status(400).json({
        success: false,
        message: "나이와 성별은 필수 입력 항목입니다.",
      });
    }

    // 연령대 판단
    const determinedAgeGroup = ageGroup || getAgeGroup(parseInt(age));
    const ageGroupInfo = getMeasurementItems(determinedAgeGroup);

    // 측정 항목 검증 및 정리
    const processedItems = {};
    if (measurementItems) {
      // 입력된 측정 항목들을 정리
      Object.keys(measurementItems).forEach((key) => {
        if (measurementItems[key] !== null && measurementItems[key] !== "") {
          processedItems[key] = measurementItems[key];
        }
      });
    }

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

    // 측정 데이터 JSON 형태로 저장 (공공데이터 형식에 맞춤)
    const measurementData = JSON.stringify({
      ageGroup: determinedAgeGroup,
      age: parseInt(age),
      gender,
      activityLevel: activityLevel || "moderate",
      goal: goal || "health",
      healthConditions: healthConditions || null,
      measurementItems: processedItems, // 연령대별 측정 항목들
    });

    // 1. 측정 정보 DB 저장
    const [measurementResult] = await pool.execute(
      "INSERT INTO measurement (user_id, measurement_data) VALUES (?, ?)",
      [userId, measurementData]
    );

    const measurementId = measurementResult.insertId;

    // 2. AI 서버 호출 (레시피 생성)
    const aiResponse = await aiService.generateRecipe({
      ageGroup: determinedAgeGroup,
      age: parseInt(age),
      gender,
      activityLevel: activityLevel || "moderate",
      goal: goal || "health",
      healthConditions,
      measurementItems: processedItems,
    });

    // 3. 레시피 정보 DB 저장
    const [recipeResult] = await pool.execute(
      `INSERT INTO recipe (
        measurement_id, 
        category_id, 
        recipe_title, 
        recipe_intro, 
        difficulty, 
        duration_min, 
        fitness_grade, 
        fitness_score, 
        exercise_cards
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        measurementId,
        aiResponse.categoryId || 1, // 기본 카테고리
        aiResponse.recipeTitle,
        aiResponse.recipeIntro,
        aiResponse.difficulty,
        aiResponse.durationMin,
        aiResponse.fitnessGrade,
        aiResponse.fitnessScore,
        JSON.stringify(aiResponse.exerciseCards), // 운동 카드 목록
      ]
    );

    const recipeId = recipeResult.insertId;

    // 4. 저장된 레시피 조회
    const [recipes] = await pool.execute(
      `SELECT r.*, m.measurement_data 
       FROM recipe r 
       JOIN measurement m ON r.measurement_id = m.id 
       WHERE r.id = ?`,
      [recipeId]
    );

    const recipe = recipes[0];
    recipe.exercise_cards = JSON.parse(recipe.exercise_cards);
    recipe.measurement_data = JSON.parse(recipe.measurement_data);

    res.status(201).json({
      success: true,
      message: "체력 측정 및 운동 레시피가 생성되었습니다.",
      data: {
        measurement: {
          id: measurementId,
          measurement_data: JSON.parse(measurementData),
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
       LEFT JOIN recipe r ON m.id = r.measurement_id
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
      `SELECT r.* FROM recipe r WHERE r.measurement_id = ?`,
      [measurementId]
    );

    if (recipes.length === 0) {
      return res.status(404).json({
        success: false,
        message: "레시피를 찾을 수 없습니다.",
      });
    }

    const recipe = recipes[0];
    recipe.exercise_cards = JSON.parse(recipe.exercise_cards);

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

module.exports = {
  createMeasurement,
  getMeasurements,
  getMeasurementById,
  getRecipe,
};
