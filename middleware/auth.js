// JWT 인증 미들웨어
const jwt = require("jsonwebtoken");
const pool = require("../config/database");

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "인증 토큰이 필요합니다",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 사용자 정보 확인
    const [users] = await pool.execute("SELECT * FROM users WHERE id = ?", [
      decoded.id,
    ]);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "유효하지 않은 사용자입니다",
      });
    }

    // req.user에 사용자 정보 추가
    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "유효하지 않은 토큰입니다",
      });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "토큰이 만료되었습니다",
      });
    }

    res.status(500).json({
      success: false,
      message: "인증 처리 중 오류가 발생했습니다",
    });
  }
};

module.exports = authenticate;
