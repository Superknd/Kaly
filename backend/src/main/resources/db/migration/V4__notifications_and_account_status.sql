ALTER TABLE app_users
    ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE user_notifications (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(120) NOT NULL,
    message VARCHAR(500) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    read_at TIMESTAMP(6) NULL,
    CONSTRAINT fk_user_notifications_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
);

CREATE INDEX idx_user_notifications_user_created ON user_notifications (user_id, created_at);
