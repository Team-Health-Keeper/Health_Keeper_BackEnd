const express = require("express");
const router = express.Router();
const measurementController = require("../controllers/measurement.controller");
const authenticate = require("../middleware/auth");
const { ageGroups, getAgeGroup } = require("../utils/ageGroups");

// 연령대별 측정 항목 목록 조회
router.get("/items", authenticate, (req, res) => {
  const { age, ageGroup } = req.query;

  let targetAgeGroup = ageGroup;
  if (!targetAgeGroup && age) {
    targetAgeGroup = getAgeGroup(parseInt(age));
  }

  if (!targetAgeGroup) {
    return res.status(400).json({
      success: false,
      message: "나이 또는 연령대를 입력해주세요.",
    });
  }

  const ageGroupInfo = ageGroups[targetAgeGroup];
  if (!ageGroupInfo) {
    return res.status(400).json({
      success: false,
      message: "유효하지 않은 연령대입니다.",
    });
  }

  res.json({
    success: true,
    data: {
      ageGroup: targetAgeGroup,
      required: ageGroupInfo.required,
      items: ageGroupInfo.items,
    },
  });
});

// 체력 측정 정보 입력 및 AI 레시피 생성
router.post("/", authenticate, measurementController.createMeasurement);

// 사용자의 측정 기록 조회
router.get("/", authenticate, measurementController.getMeasurements);

// 특정 측정 기록 조회
router.get("/:id", authenticate, measurementController.getMeasurementById);

// 레시피 조회
router.get("/:id/recipe", authenticate, measurementController.getRecipe);

module.exports = router;
