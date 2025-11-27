// MySQL Database configuration
const mysql = require("mysql2/promise");

// Connection pool 생성
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || "health_keeper",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// 연결 테스트 함수
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MySQL 데이터베이스 연결 성공 (health_keeper)");
    connection.release();
    return true;
  } catch (error) {
    console.error("❌ 데이터베이스 연결 실패:", error.message);
    return false;
  }
};

// 연결 테스트 실행 (서버 시작 시)
testConnection().catch((err) => {
  console.error("데이터베이스 연결 테스트 오류:", err.message);
});

module.exports = pool;
