const pool = require("../config/database");
const aiService = require("../services/ai.service");
const { getAgeGroup, getMeasurementItems } = require("../utils/ageGroups");

// video_duration 파싱 유틸리티 함수
const parseVideoDuration = (durationStr) => {
  if (!durationStr) return 0;
  const parts = durationStr.split(":").map((p) => parseInt(p) || 0);

  if (parts.length === 3) {
    // "27:30:00" 형식 처리
    // 비디오 길이는 보통 1시간 미만이므로, 첫 번째 숫자가 60 미만이면 분:초:00 형식
    if (parts[0] >= 60) {
      // 시:분:초 형식 (예: "1:30:15" = 1시간 30분 15초)
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      // 분:초:00 형식 (예: "27:30:00" = 27분 30초, "25:15:00" = 25분 15초)
      return parts[0] * 60 + parts[1];
    }
  } else if (parts.length === 2) {
    // 분:초 형식 (예: "1:27" = 1분 27초, "23:28" = 23분 28초)
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    // 초만 있는 경우
    return parts[0];
  }
  return 0;
};

// 체력 측정 정보 입력 및 AI 레시피 생성
const createMeasurement = async (req, res) => {
  console.log("=== [체력 측정] 시작 ===");
  console.log("[체력 측정] 환경:", process.env.NODE_ENV || "development");
  console.log("[체력 측정] AI 서버 URL:", process.env.AI_SERVER_URL || "미설정");
  console.log("[체력 측정] OpenAI API Key:", process.env.OPENAI_API_KEY ? "설정됨" : "미설정");
  
  try {
    const userId = req.user.id;
    const reqArr = req.body.req_arr || req.body.measurements;

    console.log("[체력 측정] User ID:", userId);
    console.log("[체력 측정] 입력 데이터 개수:", reqArr?.length || 0);

    // 입력 검증
    if (!reqArr || !Array.isArray(reqArr) || reqArr.length === 0) {
      console.error("[체력 측정] 입력 검증 실패: 측정 항목 없음");
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
    let months = null; // 개월 수 (measure_key: 55)

    reqArr.forEach((item) => {
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

      if (key === "53" || key === "age") {
        age = parseInt(value);
        processedItems[key] = value;
      } else if (key === "54" || key === "gender") {
        gender =
          value === "male" || value === "M"
            ? "M"
            : value === "female" || value === "F"
            ? "F"
            : value;
        processedItems[key] = value;
      } else if (key === "55") {
        // 개월 수 (유아일 때)
        months = parseInt(value);
        processedItems[key] = value;
      } else {
        processedItems[key] = value;
      }
    });

    if (!age) {
      age = 30;
    }
    if (!gender) {
      gender = "M";
    }

    console.log("[체력 측정] 처리된 데이터 - 나이:", age, "성별:", gender, "개월수:", months);

    // 연령대 판단
    const determinedAgeGroup = getAgeGroup(age);
    const ageGroupInfo = getMeasurementItems(determinedAgeGroup);
    
    console.log("[체력 측정] 연령대:", determinedAgeGroup);

    // 필수 항목 확인 (신장, 체중)
    const requiredItems = ageGroupInfo.required || ["1", "2"];
    const hasRequired = requiredItems.every(
      (key) => processedItems[key] !== undefined && processedItems[key] !== null
    );

    if (!hasRequired) {
      console.error("[체력 측정] 필수 항목 누락:", requiredItems);
      return res.status(400).json({
        success: false,
        message: `필수 측정 항목이 누락되었습니다. (${
          ageGroupInfo.items[requiredItems[0]]
        }, ${ageGroupInfo.items[requiredItems[1]]})`,
      });
    }

    console.log("[체력 측정] 필수 항목 검증 통과");

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

    console.log("[체력 측정] 측정 UUID 생성:", measurementUUID);

    // 1. 각 측정 항목별로 별도의 행으로 저장
    const insertedMeasurementIds = [];
    console.log("[체력 측정] DB 저장 시작 - 항목 수:", Object.keys(processedItems).length);

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

    console.log("[체력 측정] DB 저장 완료 - Measurement ID:", measurementId);
    console.log("[체력 측정] AI 서버 호출 시작...");

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

    console.log("[체력 측정] AI 서버 응답 받음");
    console.log("[체력 측정] - 체력 등급:", aiResponse.fitnessGrade);
    console.log("[체력 측정] - 체력 점수:", aiResponse.fitnessScore);
    console.log("[체력 측정] - 난이도:", aiResponse.difficulty);

    // 3. AI 서버에서 받은 운동 이름들을 card 테이블과 매칭하여 ID 찾기
    const warmUpExercises = aiResponse.warmUpExercises || [];
    const mainExercises = aiResponse.mainExercises || [];
    const coolDownExercises = aiResponse.coolDownExercises || [];
    
    console.log("[체력 측정] 운동 목록:");
    console.log("[체력 측정] - 준비운동:", warmUpExercises.length + "개");
    console.log("[체력 측정] - 본운동:", mainExercises.length + "개");
    console.log("[체력 측정] - 정리운동:", coolDownExercises.length + "개");

    const convertExerciseNamesToCardIds = async (exerciseNames) => {
      const cardIds = [];

      for (const exerciseName of exerciseNames) {
        if (!exerciseName || typeof exerciseName !== "string") {
          continue;
        }

        const [matchedCards] = await pool.execute(
          `SELECT id FROM card WHERE exercise_name = ? LIMIT 1`,
          [exerciseName]
        );

        if (matchedCards.length > 0) {
          cardIds.push(matchedCards[0].id);
        }
      }

      return cardIds;
    };

    const warmUpCardIdArray = await convertExerciseNamesToCardIds(
      warmUpExercises
    );
    const mainCardIdArray = await convertExerciseNamesToCardIds(mainExercises);
    const coolDownCardIdArray = await convertExerciseNamesToCardIds(
      coolDownExercises
    );

    // 각 카테고리 내에서만 중복 제거 (카테고리 간 중복은 허용)
    const removeDuplicatesInArray = (arr) => {
      return [...new Set(arr)];
    };

    const uniqueWarmUpCardIds = removeDuplicatesInArray(warmUpCardIdArray);
    const uniqueMainCardIds = removeDuplicatesInArray(mainCardIdArray);
    const uniqueCoolDownCardIds = removeDuplicatesInArray(coolDownCardIdArray);

    const warmUpCardsString = uniqueWarmUpCardIds.join(",");
    const mainCardsString = uniqueMainCardIds.join(",");
    const coolDownCardsString = uniqueCoolDownCardIds.join(",");

    console.log("[체력 측정] 카드 ID 매칭 완료:");
    console.log("[체력 측정] - 준비운동 카드:", warmUpCardsString || "없음");
    console.log("[체력 측정] - 본운동 카드:", mainCardsString || "없음");
    console.log("[체력 측정] - 정리운동 카드:", coolDownCardsString || "없음");

    // duration 계산: 각 카테고리별로 계산 후 합산 (카테고리 간 중복 허용)
    const calculateCategoryDuration = async (cardIds) => {
      if (cardIds.length === 0) return 0;
      const placeholders = cardIds.map(() => "?").join(",");
      const [cards] = await pool.execute(
        `SELECT video_duration FROM card WHERE id IN (${placeholders})`,
        cardIds
      );

      let totalSeconds = 0;
      cards.forEach((card) => {
        totalSeconds += parseVideoDuration(card.video_duration);
      });
      return totalSeconds;
    };

    // 각 카테고리별로 duration 계산 후 합산
    const warmUpDuration = await calculateCategoryDuration(uniqueWarmUpCardIds);
    const mainDuration = await calculateCategoryDuration(uniqueMainCardIds);
    const coolDownDuration = await calculateCategoryDuration(
      uniqueCoolDownCardIds
    );
    const totalDurationSeconds =
      warmUpDuration + mainDuration + coolDownDuration;

    const durationMin = Math.round(totalDurationSeconds / 60);
    
    console.log("[체력 측정] 총 소요 시간:", durationMin + "분");
    console.log("[체력 측정] Recipe DB 저장 시작...");

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
        warm_up_cards,
        main_cards,
        cool_down_cards
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        measurementId,
        aiResponse.recipeTitle || "맞춤 운동 레시피",
        aiResponse.recipeIntro || "AI가 추천하는 맞춤형 운동 프로그램입니다.",
        aiResponse.difficulty || "초급",
        durationMin,
        aiResponse.fitnessGrade || "참가",
        aiResponse.fitnessScore || 0,
        warmUpCardsString,
        mainCardsString,
        coolDownCardsString,
      ]
    );

    const recipeId = recipeResult.insertId;
    console.log("[체력 측정] Recipe 저장 완료 - Recipe ID:", recipeId);

    // 5. 저장된 레시피 조회 및 card 테이블에서 카드 정보 가져오기
    const [recipes] = await pool.execute(
      `SELECT r.* FROM recipe r WHERE r.id = ?`,
      [recipeId]
    );

    const recipe = recipes[0];

    const getAllCardIds = (cardsString) => {
      if (!cardsString) return [];
      const ids = cardsString
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
      // 각 카테고리 내에서만 중복 제거
      return [...new Set(ids)];
    };

    const warmUpCardIds = getAllCardIds(recipe.warm_up_cards);
    const mainCardIds = getAllCardIds(recipe.main_cards);
    const coolDownCardIds = getAllCardIds(recipe.cool_down_cards);

    const formatSecondsToDuration = (seconds) => {
      if (!seconds || seconds === 0) return "0:00";
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}:${String(secs).padStart(2, "0")}`;
    };

    const formatCard = (card) => ({
      exercise_name: card.exercise_name || "",
      description: card.description || "",
      video_url: card.video_url || "",
      image_url: card.image_url || "",
      video_duration: formatSecondsToDuration(
        parseVideoDuration(card.video_duration)
      ),
      fitness_category: card.fitness_category || "",
      equipment: card.equipment || "",
      body_part: card.body_part || "",
      target_audience: card.target_audience || "",
    });

    const getCardsByIds = async (cardIds) => {
      if (cardIds.length === 0) return [];
      const placeholders = cardIds.map(() => "?").join(",");
      const [cards] = await pool.execute(
        `SELECT * FROM card WHERE id IN (${placeholders}) ORDER BY FIELD(id, ${placeholders})`,
        [...cardIds, ...cardIds]
      );
      return cards.map(formatCard);
    };

    const warmUpCardList = await getCardsByIds(warmUpCardIds);
    const mainCardList = await getCardsByIds(mainCardIds);
    const coolDownCardList = await getCardsByIds(coolDownCardIds);

    // grass_history 테이블의 measurement 컬럼 업데이트
    // today 변수는 이미 위에서 선언되었으므로 YYYY-MM-DD 형식으로 변환
    const todayDateString = today.toISOString().split("T")[0]; // YYYY-MM-DD 형식
    try {
      // 오늘 날짜에 대한 기록이 있는지 확인
      const [existingRecords] = await pool.execute(
        "SELECT * FROM grass_history WHERE user_id = ? AND record_date = ?",
        [userId, todayDateString]
      );

      if (existingRecords.length === 0) {
        // 오늘 날짜에 기록이 없으면 새로 삽입
        await pool.execute(
          "INSERT INTO grass_history (user_id, attendance, video_watch, measurement, record_date) VALUES (?, ?, ?, ?, ?)",
          [userId, "N", "N", "Y", todayDateString]
        );
        console.log(
          `[grass_history] 측정 기록 추가: user_id=${userId}, date=${todayDateString}`
        );
      } else {
        // 이미 기록이 있으면 measurement만 업데이트
        await pool.execute(
          "UPDATE grass_history SET measurement = ? WHERE user_id = ? AND record_date = ?",
          ["Y", userId, todayDateString]
        );
        console.log(
          `[grass_history] 측정 업데이트: user_id=${userId}, date=${todayDateString}`
        );
      }
    } catch (error) {
      // grass_history 업데이트 실패해도 측정 생성은 계속 진행
      console.error("[grass_history] 측정 기록 업데이트 오류:", error);
    }

    console.log("[체력 측정] 응답 전송 준비 완료");
    console.log("=== [체력 측정] 완료 ===\n");

    res.status(201).json({
      recipe_title: recipe.recipe_title || "",
      recipe_intro: recipe.recipe_intro || "",
      difficulty: recipe.difficulty || "",
      duration_min: recipe.duration_min || 0,
      fitness_grade: recipe.fitness_grade || "",
      warm_up_card_list: warmUpCardList,
      main_card_list: mainCardList,
      cool_down_card_list: coolDownCardList,
    });
  } catch (error) {
    console.error("=== [체력 측정] 오류 발생 ===");
    console.error("[체력 측정] 오류 메시지:", error.message);
    console.error("[체력 측정] 오류 스택:", error.stack);
    console.error("[체력 측정] 오류 타입:", error.constructor.name);
    if (error.response) {
      console.error("[체력 측정] API 응답 상태:", error.response.status);
      console.error("[체력 측정] API 응답 데이터:", error.response.data);
    }
    console.error("=== [체력 측정] 오류 끝 ===\n");
    
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

    const parseCardIdsForRecipe = (cardsString) => {
      if (!cardsString) return [];
      const ids = cardsString
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
      // 각 카테고리 내에서만 중복 제거
      return [...new Set(ids)];
    };

    const warmUpIdsForRecipe = parseCardIdsForRecipe(recipe.warm_up_cards);
    const mainIdsForRecipe = parseCardIdsForRecipe(recipe.main_cards);
    const coolDownIdsForRecipe = parseCardIdsForRecipe(recipe.cool_down_cards);

    // 각 카테고리별로 카드 조회 (카테고리 간 중복은 허용)
    const getCardsByIds = async (cardIds) => {
      if (cardIds.length === 0) return [];
      const placeholders = cardIds.map(() => "?").join(",");
      const [cards] = await pool.execute(
        `SELECT * FROM card WHERE id IN (${placeholders}) ORDER BY FIELD(id, ${placeholders})`,
        [...cardIds, ...cardIds]
      );
      return cards;
    };

    const warmUpCards = await getCardsByIds(warmUpIdsForRecipe);
    const mainCards = await getCardsByIds(mainIdsForRecipe);
    const coolDownCards = await getCardsByIds(coolDownIdsForRecipe);

    recipe.warm_up_cards_list = warmUpCards;
    recipe.main_cards_list = mainCards;
    recipe.cool_down_cards_list = coolDownCards;

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
