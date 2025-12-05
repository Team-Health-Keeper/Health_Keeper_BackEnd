const axios = require("axios");
const { OpenAI } = require("openai");

// AI 서버 URL (환경 변수에서 가져오기, 없으면 mock 사용)
const AI_SERVER_URL = process.env.AI_SERVER_URL || null;

// OpenAI 클라이언트 초기화
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

/**
 * 연령대별 측정 항목 필드 순서 정의
 */
const AGE_GROUP_FIELDS = {
  유아기: [
    "MESURE_AGE_CO", // features[0]에는 개월수가 들어감
    "SEXDSTN_FLAG_CD",
    "MESURE_IEM_001_VALUE",
    "MESURE_IEM_002_VALUE",
    "MESURE_IEM_007_VALUE",
    "MESURE_IEM_008_VALUE",
    "MESURE_IEM_009_VALUE",
    "MESURE_IEM_012_VALUE",
    "MESURE_IEM_018_VALUE",
    "MESURE_IEM_020_VALUE",
    "MESURE_IEM_022_VALUE",
    "MESURE_IEM_028_VALUE",
    "MESURE_IEM_050_VALUE",
    "MESURE_IEM_051_VALUE",
  ],
  유소년기: [
    "MESURE_AGE_CO",
    "SEXDSTN_FLAG_CD",
    "MESURE_IEM_001_VALUE",
    "MESURE_IEM_002_VALUE",
    "MESURE_IEM_004_VALUE",
    "MESURE_IEM_007_VALUE",
    "MESURE_IEM_008_VALUE",
    "MESURE_IEM_009_VALUE",
    "MESURE_IEM_012_VALUE",
    "MESURE_IEM_018_VALUE",
    "MESURE_IEM_020_VALUE",
    "MESURE_IEM_022_VALUE",
    "MESURE_IEM_028_VALUE",
    "MESURE_IEM_042_VALUE",
    "MESURE_IEM_043_VALUE",
    "MESURE_IEM_044_VALUE",
  ],
  청소년기: [
    "MESURE_AGE_CO",
    "SEXDSTN_FLAG_CD",
    "MESURE_IEM_001_VALUE",
    "MESURE_IEM_002_VALUE",
    "MESURE_IEM_003_VALUE",
    "MESURE_IEM_005_VALUE",
    "MESURE_IEM_006_VALUE",
    "MESURE_IEM_007_VALUE",
    "MESURE_IEM_009_VALUE",
    "MESURE_IEM_010_VALUE",
    "MESURE_IEM_012_VALUE",
    "MESURE_IEM_013_VALUE",
    "MESURE_IEM_014_VALUE",
    "MESURE_IEM_015_VALUE",
    "MESURE_IEM_016_VALUE",
    "MESURE_IEM_017_VALUE",
    "MESURE_IEM_018_VALUE",
    "MESURE_IEM_020_VALUE",
    "MESURE_IEM_022_VALUE",
    "MESURE_IEM_028_VALUE",
    "MESURE_IEM_030_VALUE",
  ],
  성인기: [
    "MESURE_AGE_CO",
    "SEXDSTN_FLAG_CD",
    "MESURE_IEM_001_VALUE",
    "MESURE_IEM_002_VALUE",
    "MESURE_IEM_003_VALUE",
    "MESURE_IEM_004_VALUE",
    "MESURE_IEM_005_VALUE",
    "MESURE_IEM_006_VALUE",
    "MESURE_IEM_007_VALUE",
    "MESURE_IEM_008_VALUE",
    "MESURE_IEM_012_VALUE",
    "MESURE_IEM_018_VALUE",
    "MESURE_IEM_019_VALUE",
    "MESURE_IEM_022_VALUE",
    "MESURE_IEM_028_VALUE",
    "MESURE_IEM_036_VALUE",
    "MESURE_IEM_037_VALUE",
    "MESURE_IEM_040_VALUE",
  ],
  어르신기: [
    "MESURE_AGE_CO",
    "SEXDSTN_FLAG_CD",
    "MESURE_IEM_001_VALUE",
    "MESURE_IEM_002_VALUE",
    "MESURE_IEM_003_VALUE",
    "MESURE_IEM_004_VALUE",
    "MESURE_IEM_005_VALUE",
    "MESURE_IEM_006_VALUE",
    "MESURE_IEM_007_VALUE",
    "MESURE_IEM_008_VALUE",
    "MESURE_IEM_012_VALUE",
    "MESURE_IEM_018_VALUE",
    "MESURE_IEM_023_VALUE",
    "MESURE_IEM_025_VALUE",
    "MESURE_IEM_026_VALUE",
    "MESURE_IEM_027_VALUE",
    "MESURE_IEM_028_VALUE",
    "MESURE_IEM_052_VALUE",
  ],
};

/**
 * 나이를 기준으로 연령대 판단
 * @param {number} age - 나이
 * @returns {string} 연령대 (유아기, 유소년기, 청소년기, 성인기, 어르신기)
 */
const determineAgeGroup = (age) => {
  if (age < 7) return "유아기"; // 48~83개월 (4~6세)
  if (age <= 12) return "유소년기"; // 11~12세
  if (age <= 18) return "청소년기"; // 13~18세
  if (age <= 64) return "성인기"; // 19~64세
  return "어르신기"; // 65세 이상
};

/**
 * 프론트엔드 입력을 AI API 입력 형식으로 변환
 * @param {Object} measurementItems - 프론트엔드에서 받은 측정 항목 {measure_key: measure_value}
 * @param {number} age - 나이
 * @param {string} gender - 성별 (M 또는 F)
 * @returns {Object} AI API 입력 형식 { age: number, features: number[] }
 */
const convertToAIInput = (measurementItems, age, gender) => {
  // 연령대 판단
  const ageGroup = determineAgeGroup(age);
  const fields = AGE_GROUP_FIELDS[ageGroup] || AGE_GROUP_FIELDS["성인기"];

  // measure_key를 MESURE_IEM_XXX_VALUE 형식으로 매핑
  const measurementMap = {};
  for (const [measureKey, measureValue] of Object.entries(measurementItems)) {
    const keyNum = parseInt(measureKey);

    if (keyNum === 53 || measureKey === "age") {
      measurementMap["MESURE_AGE_CO"] = parseFloat(measureValue) || age;
    } else if (keyNum === 54 || measureKey === "gender") {
      // 성별: M=0, F=1 (AI 서버 형식에 맞게 변환)
      measurementMap["SEXDSTN_FLAG_CD"] =
        measureValue === "M" || measureValue === "male" ? 0 : 1;
    } else if (keyNum === 55) {
      // 개월 수 - 유아기일 때 features[0]에 사용
      measurementMap["MESURE_IEM_053_VALUE"] = parseFloat(measureValue) || 0;
    } else if (keyNum >= 1 && keyNum <= 52 && keyNum !== 11) {
      const paddedKey = String(keyNum).padStart(3, "0");
      const fieldName = `MESURE_IEM_${paddedKey}_VALUE`;
      measurementMap[fieldName] = parseFloat(measureValue) || 0;
    }
  }

  // 성별이 measurementMap에 없으면 gender 파라미터 사용
  if (!measurementMap["SEXDSTN_FLAG_CD"] && gender) {
    measurementMap["SEXDSTN_FLAG_CD"] = gender === "M" ? 0 : 1;
  }

  // 나이가 measurementMap에 없으면 age 파라미터 사용
  if (!measurementMap["MESURE_AGE_CO"] && age) {
    measurementMap["MESURE_AGE_CO"] = age;
  }

  // features 배열 생성
  const features = fields.map((fieldName, index) => {
    // 유아기이고 첫 번째 필드(MESURE_AGE_CO)일 때는 개월수 사용
    if (
      ageGroup === "유아기" &&
      index === 0 &&
      measurementMap["MESURE_IEM_053_VALUE"]
    ) {
      return measurementMap["MESURE_IEM_053_VALUE"];
    }
    return measurementMap[fieldName] || 0;
  });

  return {
    age: age || 30,
    features: features,
  };
};

/**
 * AI 서버를 호출하여 운동 레시피 생성
 * @param {Object} measurementData - 체력 측정 정보
 * @returns {Promise<Object>} 레시피 정보
 */
const generateRecipe = async (measurementData) => {
  console.log("[AI Service] generateRecipe 시작");
  console.log("[AI Service] AI_SERVER_URL:", AI_SERVER_URL || "미설정");
  console.log("[AI Service] OpenAI 클라이언트:", openaiClient ? "설정됨" : "미설정");
  
  try {
    // AI 서버가 설정되어 있으면 호출 (현재는 비활성화)
    if (AI_SERVER_URL) {
      console.log("[AI Service] AI 서버 호출 경로 선택");
      try {
        // 프론트엔드 입력을 AI API 입력 형식으로 변환
        console.log("[AI Service] 입력 데이터 변환 시작");
        const aiInput = convertToAIInput(
          measurementData.measurementItems,
          measurementData.age,
          measurementData.gender
        );
        
        console.log("[AI Service] 변환된 입력 데이터:");
        console.log("[AI Service] - age:", aiInput.age);
        console.log("[AI Service] - features 길이:", aiInput.features?.length);
        console.log("[AI Service] - features:", JSON.stringify(aiInput.features));

        console.log("[AI Service] AI 서버 POST 요청:", `${AI_SERVER_URL}/predict`);
        const response = await axios.post(`${AI_SERVER_URL}/predict`, aiInput, {
          timeout: 10000,
        });
        
        console.log("[AI Service] AI 서버 응답 받음");
        console.log("[AI Service] 응답 상태:", response.status);
        console.log("[AI Service] 응답 데이터:", JSON.stringify(response.data));

        const groupExercise = response.data.group_exercise || {};
        const coawLogit = response.data.coaw_logit || [];

        const warmUpExercises = groupExercise["준비운동"] || [];
        const mainExercises = groupExercise["본운동"] || [];
        const coolDownExercises = groupExercise["정리운동"] || [];
        let maxIndex = 0;
        let maxValue = coawLogit[0] || 0;
        for (let i = 1; i < coawLogit.length; i++) {
          if (coawLogit[i] > maxValue) {
            maxValue = coawLogit[i];
            maxIndex = i;
          }
        }

        const gradeMap = {
          0: "1등급",
          1: "2등급",
          2: "3등급",
          3: "참가",
        };
        const fitnessGrade = gradeMap[maxIndex] || "참가";
        const fitnessScore = maxValue;
        
        console.log("[AI Service] 체력 등급 계산:");
        console.log("[AI Service] - maxIndex:", maxIndex);
        console.log("[AI Service] - maxValue:", maxValue);
        console.log("[AI Service] - fitnessGrade:", fitnessGrade);
        
        const exerciseData = {
          준비운동: warmUpExercises,
          본운동: mainExercises,
          마무리운동: coolDownExercises,
          등급: fitnessGrade,
        };

        let recipeTitle = "맞춤 운동 레시피";
        let recipeIntro = "AI가 추천하는 맞춤형 운동 프로그램입니다.";
        let difficulty = "초급";

        if (openaiClient) {
          console.log("[AI Service] OpenAI 호출 시작...");
          try {
            const systemPrompt = `
당신은 운동 처방 프로그램의 메타데이터를 생성하는 AI입니다.
입력:
- 항상 JSON 형식의 운동 루틴 정보가 주어집니다.
- 필드:
  - "본운동": [String 배열]
  - "준비운동": [String 배열]
  - "마무리운동": [String 배열]
  - "등급": String (예: "1등급", "2등급", "3등급", "참가")
규칙:
1. 입력 JSON을 분석해서 다음 필드를 생성하세요.
   - recipe_title: 운동 처방의 제목
     - 자연스러운 한글 제목으로 작성합니다.
     - 공백 포함 30자 이내로 작성합니다.
   - recipe_intro: 운동 처방 소개/설명
     - 2~3문장으로 작성합니다.
     - 반드시 존댓말("~합니다", "~하세요")로 작성합니다.
     - 준비운동 → 본운동 → 마무리운동의 흐름이 자연스럽게 드러나도록 설명합니다.
     - 어떤 대상/목적(예: 초보자, 체력 향상, 다이어트, 유연성 향상 등)에 적합한 루틴인지 언급합니다.
   - difficulty: 난이도 (아래 값 중 하나만 사용)
     - "상급"
     - "중급"
     - "초급"
2. difficulty는 입력된 "등급" 값을 다음 규칙으로 변환합니다.
   - "1등급" → "상급"
   - "2등급" → "중급"
   - "3등급", "참가" → "초급"
3. 반드시 아래 형식의 JSON만 순수 텍스트로 반환하세요.
   - 키 이름은 정확히 다음만 사용합니다.
     - "recipe_title"
     - "recipe_intro"
     - "difficulty"
4. JSON 외의 다른 텍스트(설명, 주석, 마크다운, 문장)를 절대 출력하지 마세요.
5. JSON은 유효한 형식이어야 하며, 끝에 쉼표를 넣지 마세요.
`;

            const openaiResponse = await openaiClient.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: systemPrompt,
                },
                {
                  role: "user",
                  content: JSON.stringify(exerciseData),
                },
              ],
            });

            console.log("[AI Service] OpenAI 응답 받음");
            const content = openaiResponse.choices[0].message.content.trim();
            console.log("[AI Service] OpenAI 응답 내용:", content);
            
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              recipeTitle = parsed.recipe_title || recipeTitle;
              recipeIntro = parsed.recipe_intro || recipeIntro;
              difficulty = parsed.difficulty || difficulty;
              console.log("[AI Service] OpenAI 파싱 성공");
            } else {
              console.warn("[AI Service] OpenAI 응답에서 JSON을 찾을 수 없음");
            }
          } catch (error) {
            console.error("[AI Service] OpenAI 호출 오류:", error.message);
            console.error("[AI Service] OpenAI 오류 스택:", error.stack);
          }
        } else {
          console.warn("[AI Service] OpenAI 클라이언트가 설정되지 않음");
        }

        console.log("[AI Service] 최종 레시피 메타데이터:");
        console.log("[AI Service] - recipeTitle:", recipeTitle);
        console.log("[AI Service] - difficulty:", difficulty);
        console.log("[AI Service] - fitnessGrade:", fitnessGrade);
        
        return {
          categoryId: 1,
          recipeTitle,
          recipeIntro,
          difficulty,
          durationMin: 0,
          fitnessGrade,
          fitnessScore,
          warmUpExercises,
          mainExercises,
          coolDownExercises,
        };
      } catch (aiServerError) {
        console.error("[AI Service] AI 서버 호출 오류");
        console.error("[AI Service] 오류 메시지:", aiServerError.message);
        console.error("[AI Service] 오류 스택:", aiServerError.stack);
        if (aiServerError.response) {
          console.error("[AI Service] 응답 상태:", aiServerError.response.status);
          console.error("[AI Service] 응답 데이터:", aiServerError.response.data);
        }
        console.log("[AI Service] OpenAI 전용 모드로 전환");
        return await generateRecipeWithOpenAIOnly(measurementData);
      }
    } else {
      console.log("[AI Service] AI 서버 미설정 - OpenAI 전용 모드");
      return await generateRecipeWithOpenAIOnly(measurementData);
    }
  } catch (error) {
    console.error("[AI Service] 전체 오류:", error.message);
    console.error("[AI Service] 전체 오류 스택:", error.stack);
    return await generateRecipeWithOpenAIOnly(measurementData);
  }
};

/**
 * OpenAI만 사용하여 레시피 메타데이터 생성 (AI 서버 없이)
 */
const generateRecipeWithOpenAIOnly = async (measurementData) => {
  console.log("[AI Service] generateRecipeWithOpenAIOnly 호출");
  const fitnessGrade = "참가";
  const fitnessScore = 0;

  const exerciseData = {
    준비운동: [],
    본운동: [],
    마무리운동: [],
    등급: fitnessGrade,
  };

  let recipeTitle = "맞춤 운동 레시피";
  let recipeIntro = "AI가 추천하는 맞춤형 운동 프로그램입니다.";
  let difficulty = "초급";

  if (openaiClient) {
    try {
      const systemPrompt = `
당신은 운동 처방 프로그램의 메타데이터를 생성하는 AI입니다.
입력:
- 항상 JSON 형식의 운동 루틴 정보가 주어집니다.
- 필드:
  - "본운동": [String 배열]
  - "준비운동": [String 배열]
  - "마무리운동": [String 배열]
  - "등급": String (예: "1등급", "2등급", "3등급", "참가")
규칙:
1. 입력 JSON을 분석해서 다음 필드를 생성하세요.
   - recipe_title: 운동 처방의 제목
     - 자연스러운 한글 제목으로 작성합니다.
     - 공백 포함 30자 이내로 작성합니다.
   - recipe_intro: 운동 처방 소개/설명
     - 2~3문장으로 작성합니다.
     - 반드시 존댓말("~합니다", "~하세요")로 작성합니다.
     - 준비운동 → 본운동 → 마무리운동의 흐름이 자연스럽게 드러나도록 설명합니다.
     - 어떤 대상/목적(예: 초보자, 체력 향상, 다이어트, 유연성 향상 등)에 적합한 루틴인지 언급합니다.
   - difficulty: 난이도 (아래 값 중 하나만 사용)
     - "상급"
     - "중급"
     - "초급"
2. difficulty는 입력된 "등급" 값을 다음 규칙으로 변환합니다.
   - "1등급" → "상급"
   - "2등급" → "중급"
   - "3등급", "참가" → "초급"
3. 반드시 아래 형식의 JSON만 순수 텍스트로 반환하세요.
   - 키 이름은 정확히 다음만 사용합니다.
     - "recipe_title"
     - "recipe_intro"
     - "difficulty"
4. JSON 외의 다른 텍스트(설명, 주석, 마크다운, 문장)를 절대 출력하지 마세요.
5. JSON은 유효한 형식이어야 하며, 끝에 쉼표를 넣지 마세요.
`;

      const openaiResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: JSON.stringify(exerciseData),
          },
        ],
      });

      const content = openaiResponse.choices[0].message.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        recipeTitle = parsed.recipe_title || recipeTitle;
        recipeIntro = parsed.recipe_intro || recipeIntro;
        difficulty = parsed.difficulty || difficulty;
      }
    } catch (error) {
      console.error("[AI Service] OpenAI 호출 오류:", error.message);
    }
  }

  // AI 서버가 완성되기 전까지 임시 하드코딩된 운동 목록 (실제 card 테이블 데이터 사용)
  // TODO: AI 서버 완성 후 제거
  const warmUpExercises = ["흔들어 체조", "거북이 스트레칭", "조깅"];
  const mainExercises = ["동물처럼 걸어요", "밴드를 당겨요", "줄넘기"];
  const coolDownExercises = [
    "흔들어 체조",
    "후굴자세 해봐요",
    "거북이 스트레칭",
  ];

  console.log("[AI Service] Mock 운동 목록 사용");
  console.log("[AI Service] - recipeTitle:", recipeTitle);
  console.log("[AI Service] - difficulty:", difficulty);

  return {
    categoryId: 1,
    recipeTitle,
    recipeIntro,
    difficulty,
    durationMin: 0,
    fitnessGrade,
    fitnessScore,
    warmUpExercises,
    mainExercises,
    coolDownExercises,
  };
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
  let fitnessGrade = "참가"; // ENUM: '1등급','2등급','3등급','참가'

  if (goal === "weight_loss") {
    if (bmi > 25) {
      difficulty = "중급";
      fitnessScore = 60;
      fitnessGrade = "3등급";
    }
  } else if (goal === "muscle_gain") {
    difficulty = "중급";
    fitnessScore = 70;
    fitnessGrade = "2등급";
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

  // Mock 운동 (새로운 형식)
  const warmUpExercises = ["스트레칭", "가벼운 조깅"];
  const mainExercises = ["유산소 운동", "근력 운동"];
  const coolDownExercises = ["호흡 정리", "천천히 걷기"];

  return {
    categoryId: 1,
    recipeTitle: recipeTitles[goal] || recipeTitles.health,
    recipeIntro: recipeIntros[goal] || recipeIntros.health,
    difficulty,
    durationMin: 30,
    fitnessGrade,
    fitnessScore,
    warmUpExercises,
    mainExercises,
    coolDownExercises,
  };
};

module.exports = {
  generateRecipe,
};
