<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('app_users')) {
            Schema::create('app_users', function (Blueprint $table): void {
                $table->char('id', 36)->primary();
                $table->string('display_name', 100);
                $table->string('email', 254)->unique('uk_app_users_email');
                $table->string('password_hash', 60);
                $table->string('role', 16);
                $table->boolean('enabled')->default(true);
                $table->timestamp('created_at', 6);
            });
        }

        if (!Schema::hasTable('folders')) {
            Schema::create('folders', function (Blueprint $table): void {
                $table->char('id', 36)->primary();
                $table->string('name', 100);
                $table->timestamp('created_at', 6);
                $table->char('owner_id', 36);
                $table->foreign('owner_id', 'fk_folders_owner')->references('id')->on('app_users');
                $table->unique(['owner_id', 'name'], 'uk_folders_owner_name');
                $table->index(['owner_id', 'name'], 'idx_folders_owner_name');
            });
        }

        if (!Schema::hasTable('documents')) {
            Schema::create('documents', function (Blueprint $table): void {
                $table->char('id', 36)->primary();
                $table->string('original_filename', 255);
                $table->char('storage_key', 36)->unique('uk_documents_storage_key');
                $table->string('content_type', 100);
                $table->unsignedBigInteger('size_bytes');
                $table->timestamp('created_at', 6);
                $table->timestamp('modified_at', 6);
                $table->char('owner_id', 36);
                $table->char('folder_id', 36)->nullable();
                $table->foreign('owner_id', 'fk_documents_owner')->references('id')->on('app_users');
                $table->foreign('folder_id', 'fk_documents_folder')->references('id')->on('folders');
                $table->index(['owner_id', 'created_at'], 'idx_documents_owner_created');
            });
        }

        if (!Schema::hasTable('password_reset_tokens')) {
            Schema::create('password_reset_tokens', function (Blueprint $table): void {
                $table->char('id', 36)->primary();
                $table->char('token_hash', 64)->unique('uk_password_reset_tokens_hash');
                $table->char('user_id', 36);
                $table->timestamp('created_at', 6);
                $table->timestamp('expires_at', 6);
                $table->timestamp('used_at', 6)->nullable();
                $table->foreign('user_id', 'fk_password_reset_tokens_user')->references('id')->on('app_users');
                $table->index('user_id', 'idx_password_reset_tokens_user');
                $table->index('expires_at', 'idx_password_reset_tokens_expiry');
            });
        }

        if (!Schema::hasTable('user_notifications')) {
            Schema::create('user_notifications', function (Blueprint $table): void {
                $table->char('id', 36)->primary();
                $table->char('user_id', 36);
                $table->string('title', 120);
                $table->string('message', 500);
                $table->string('kind', 32);
                $table->timestamp('created_at', 6);
                $table->timestamp('read_at', 6)->nullable();
                $table->foreign('user_id', 'fk_user_notifications_user')
                    ->references('id')->on('app_users')->cascadeOnDelete();
                $table->index(['user_id', 'created_at'], 'idx_user_notifications_user_created');
            });
        }
    }

    public function down(): void
    {
        // Existing Flyway-managed tables must never be dropped by this migration.
    }
};
