<?php

namespace App\Services;

use App\Models\UserNotification;
use Illuminate\Support\Str;

class NotificationService
{
    public function create(string $userId, string $title, string $message, string $kind): void
    {
        UserNotification::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $userId,
            'title' => $title,
            'message' => $message,
            'kind' => $kind,
            'created_at' => now(),
        ]);
    }
}
