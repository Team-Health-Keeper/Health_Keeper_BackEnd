const express = require("express");
const router = express.Router();
const recipesController = require("../controllers/recipes.controller");

// 레시피 목록 조회 (공개 API - 로그인 불필요)
// GET /api/recipes?page=1&limit=20&recipe_title=검색어
router.get("/", recipesController.getAllRecipes);

// 운동 목록 조회 (공개 API - 로그인 불필요)
// GET /api/recipes/:id
router.get("/:id", recipesController.getRecipeExercises);

module.exports = router;
