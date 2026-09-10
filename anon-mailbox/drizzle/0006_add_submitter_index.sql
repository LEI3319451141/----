-- 0006_add_submitter_index.sql
-- 为 suggestions.submitter_id 加索引，加速"我的提交"查询
CREATE INDEX IF NOT EXISTS suggestions_submitter_idx
  ON suggestions (submitter_id, created_at);
