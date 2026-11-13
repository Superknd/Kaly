CREATE TABLE app_users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(60) NOT NULL,
    role VARCHAR(16) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_app_users_email UNIQUE (email)
);

CREATE TABLE documents (
    id CHAR(36) NOT NULL PRIMARY KEY,
    original_filename VARCHAR(255) NOT NULL,
    storage_key CHAR(36) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    modified_at TIMESTAMP(6) NOT NULL,
    owner_id CHAR(36) NOT NULL,
    CONSTRAINT uk_documents_storage_key UNIQUE (storage_key),
    CONSTRAINT fk_documents_owner FOREIGN KEY (owner_id) REFERENCES app_users (id)
);

CREATE INDEX idx_documents_owner_created ON documents (owner_id, created_at);
