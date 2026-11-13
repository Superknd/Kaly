CREATE TABLE folders (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    owner_id CHAR(36) NOT NULL,
    CONSTRAINT fk_folders_owner FOREIGN KEY (owner_id) REFERENCES app_users (id),
    CONSTRAINT uk_folders_owner_name UNIQUE (owner_id, name)
);

ALTER TABLE documents
    ADD COLUMN folder_id CHAR(36) NULL,
    ADD CONSTRAINT fk_documents_folder FOREIGN KEY (folder_id) REFERENCES folders (id);

CREATE INDEX idx_folders_owner_name ON folders (owner_id, name);
