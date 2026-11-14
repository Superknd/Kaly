CREATE DATABASE IF NOT EXISTS `kaly`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `kaly`;

CREATE TABLE IF NOT EXISTS `app_users` (
    `id` CHAR(36) NOT NULL,
    `display_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `password_hash` VARCHAR(60) NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `uk_app_users_email` UNIQUE (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `folders` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `created_at` TIMESTAMP(6) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_folders_owner` FOREIGN KEY (`owner_id`) REFERENCES `app_users` (`id`),
    CONSTRAINT `uk_folders_owner_name` UNIQUE (`owner_id`, `name`),
    INDEX `idx_folders_owner_name` (`owner_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documents` (
    `id` CHAR(36) NOT NULL,
    `original_filename` VARCHAR(255) NOT NULL,
    `storage_key` CHAR(36) NOT NULL,
    `content_type` VARCHAR(100) NOT NULL,
    `size_bytes` BIGINT UNSIGNED NOT NULL,
    `created_at` TIMESTAMP(6) NOT NULL,
    `modified_at` TIMESTAMP(6) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `folder_id` CHAR(36) NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `uk_documents_storage_key` UNIQUE (`storage_key`),
    CONSTRAINT `fk_documents_owner` FOREIGN KEY (`owner_id`) REFERENCES `app_users` (`id`),
    CONSTRAINT `fk_documents_folder` FOREIGN KEY (`folder_id`) REFERENCES `folders` (`id`),
    INDEX `idx_documents_owner_created` (`owner_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
    `id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `created_at` TIMESTAMP(6) NOT NULL,
    `expires_at` TIMESTAMP(6) NOT NULL,
    `used_at` TIMESTAMP(6) NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `uk_password_reset_tokens_hash` UNIQUE (`token_hash`),
    CONSTRAINT `fk_password_reset_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`),
    INDEX `idx_password_reset_tokens_user` (`user_id`),
    INDEX `idx_password_reset_tokens_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_notifications` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `created_at` TIMESTAMP(6) NOT NULL,
    `read_at` TIMESTAMP(6) NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_user_notifications_user`
        FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE,
    INDEX `idx_user_notifications_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
