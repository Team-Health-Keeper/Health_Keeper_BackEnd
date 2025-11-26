const axios = require("axios");

// AI 서버 URL (환경 변수에서 가져오기, 없으면 mock 사용)
const AI_SERVER_URL = process.env.AI_SERVER_URL || null;

/**
 * AI 서버를 호출하여 운동 레시피 생성
 * @param {Object} measurementData - 체력 측정 정보
 * @returns {Promise<Object>} 레시피 정보
 */
const generateRecipe = async (measurementData) => {
  try {
    // AI 서버가 설정되어 있으면 실제 호출
    if (AI_SERVER_URL) {
      const response = await axios.post(`${AI_SERVER_URL}/generate-recipe`, {
        ageGroup: measurementData.ageGroup,
        age: measurementData.age,
        gender: measurementData.gender,
        activityLevel: measurementData.activityLevel,
        goal: measurementData.goal,
        healthConditions: measurementData.healthConditions,
        measurementItems: measurementData.measurementItems,
      });

      return {
        categoryId: response.data.categoryId || 1,
        recipeTitle: response.data.recipeTitle,
        recipeIntro: response.data.recipeIntro,
        difficulty: response.data.difficulty || "초급",
        durationMin: response.data.durationMin || 30,
        fitnessGrade: response.data.fitnessGrade || "보통",
        fitnessScore: response.data.fitnessScore || 50,
        exerciseCards: response.data.exerciseCards || [],
      };
    } else {
      // AI 서버가 없으면 Mock 데이터 반환
      console.log("⚠️ AI 서버가 설정되지 않아 Mock 데이터를 사용합니다.");
      return generateMockRecipe(measurementData);
    }
  } catch (error) {
    console.error("AI 서버 호출 오류:", error.message);
    // AI 서버 오류 시에도 Mock 데이터 반환
    console.log("⚠️ AI 서버 오류로 Mock 데이터를 사용합니다.");
    return generateMockRecipe(measurementData);
  }
};

/**
 * Mock 레시피 생성 (AI 서버가 없을 때 사용)
 */
const generateMockRecipe = (measurementData) => {
  const { ageGroup, age, gender, goal, measurementItems } = measurementData;

  // 측정 항목에서 신장, 체중 가져오기
  const height = measurementItems?.["1"] || null; // 신장
  const weight = measurementItems?.["2"] || null; // 체중

  // BMI 계산 (신장, 체중이 있는 경우)
  let bmi = null;
  if (height && weight) {
    const heightInMeters = height / 100;
    bmi = weight / (heightInMeters * heightInMeters);
  }

  // 목표에 따른 난이도 결정
  let difficulty = "초급";
  let fitnessScore = 50;
  let fitnessGrade = "보통";

  if (goal === "weight_loss") {
    if (bmi > 25) {
      difficulty = "중급";
      fitnessScore = 60;
      fitnessGrade = "개선 필요";
    }
  } else if (goal === "muscle_gain") {
    difficulty = "중급";
    fitnessScore = 70;
    fitnessGrade = "양호";
  }

  // 목표에 따른 레시피 제목
  const recipeTitles = {
    weight_loss: "체중 감량 맞춤 운동 프로그램",
    muscle_gain: "근력 증진 맞춤 운동 프로그램",
    health: "건강 유지 맞춤 운동 프로그램",
  };

  const recipeIntros = {
    weight_loss: `BMI ${bmi.toFixed(
      1
    )} 기준으로 체중 감량에 효과적인 운동 프로그램입니다.`,
    muscle_gain: `근력 증진과 체형 개선을 위한 맞춤 운동 프로그램입니다.`,
    health: `건강한 생활을 위한 균형잡힌 운동 프로그램입니다.`,
  };

  // Mock 운동 카드
  const exerciseCards = [
    {
      id: 1,
      exercise_name: "스트레칭",
      description: "전신 근육 이완 및 유연성 향상",
      duration: 10,
    },
    {
      id: 2,
      exercise_name: "유산소 운동",
      description: "심폐 기능 향상 및 칼로리 소모",
      duration: 20,
    },
    {
      id: 3,
      exercise_name: "근력 운동",
      description: "근육 강화 및 대사율 향상",
      duration: 15,
    },
  ];

  return {
    categoryId: 1,
    recipeTitle: recipeTitles[goal] || recipeTitles.health,
    recipeIntro: recipeIntros[goal] || recipeIntros.health,
    difficulty,
    durationMin: 30,
    fitnessGrade,
    fitnessScore,
    exerciseCards,
  };
};

module.exports = {
  generateRecipe,
};
