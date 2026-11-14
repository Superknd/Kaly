<?php

use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\FolderController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PdfController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1,auth-register');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1,auth-login');
    Route::post('/password-reset', [AuthController::class, 'requestPasswordReset'])
        ->middleware('throttle:5,1,auth-password-reset');
    Route::post('/password-reset/confirm', [AuthController::class, 'confirmPasswordReset'])
        ->middleware('throttle:5,1,auth-password-reset-confirm');
    Route::get('/me', [AuthController::class, 'me'])->middleware('kaly.auth');
});

Route::middleware('kaly.auth')->group(function (): void {
    Route::get('/documents', [DocumentController::class, 'index']);
    Route::post('/documents', [DocumentController::class, 'store']);
    Route::get('/documents/{id}/content', [DocumentController::class, 'content']);
    Route::put('/documents/{id}/name', [DocumentController::class, 'rename']);
    Route::put('/documents/{id}/folder', [DocumentController::class, 'move']);
    Route::delete('/documents/{id}', [DocumentController::class, 'destroy']);

    Route::get('/folders', [FolderController::class, 'index']);
    Route::post('/folders', [FolderController::class, 'store']);
    Route::put('/folders/{id}', [FolderController::class, 'rename']);
    Route::delete('/folders/{id}', [FolderController::class, 'destroy']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::patch('/notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::patch('/notifications/read-all', [NotificationController::class, 'markAllRead']);

    Route::middleware('kaly.admin')->prefix('admin/users')->group(function (): void {
        Route::get('/', [AdminUserController::class, 'index']);
        Route::post('/', [AdminUserController::class, 'store']);
        Route::get('/{id}/activity', [AdminUserController::class, 'activity']);
        Route::patch('/{id}/role', [AdminUserController::class, 'setRole']);
        Route::post('/{id}/password-reset', [AdminUserController::class, 'sendPasswordReset'])
            ->middleware('throttle:5,1,admin-password-reset');
        Route::patch('/{id}/enabled', [AdminUserController::class, 'setEnabled']);
    });
});

Route::middleware(['kaly.auth', 'kaly.admin'])->get('/admin/stats', [AdminUserController::class, 'stats']);

Route::post('/pdf/merge', [PdfController::class, 'merge'])->middleware('kaly.auth');
