-- 운동 기록 테이블 생성
-- 랭킹 시스템을 위한 테이블

CREATE TABLE IF NOT EXISTS exercise_records (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '기록 고유 ID',
  user_id INT NOT NULL COMMENT '사용자 ID (users 테이블 FK)',
  exercise_id VARCHAR(100) NOT NULL COMMENT '운동 ID (프론트엔드 운동 식별자)',
  title VARCHAR(500) NOT NULL COMMENT '운동 제목 (예: 스쿼트 기본)',
  average_accuracy DECIMAL(5, 2) NOT NULL COMMENT '평균 정확도 (0.00 ~ 100.00)',
  exercise_duration INT NOT NULL COMMENT '운동 시간 (초 단위)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '등록/업데이트 날짜시간',
  
  -- 외래키 제약조건
  CONSTRAINT fk_exercise_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  -- 복합 유니크 제약조건 (한 유저당 한 운동에 하나의 기록만)
  UNIQUE KEY unique_user_exercise (user_id, exercise_id),
  
  -- 인덱스 (랭킹 조회 성능 최적화)
  INDEX idx_exercise_accuracy (exercise_id, average_accuracy DESC),
  INDEX idx_user_records (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='운동 랭킹 기록 테이블';

-- 테이블 확인
DESCRIBE exercise_records;
