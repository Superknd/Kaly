<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\KalyUser;
use App\Models\UserNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifications = UserNotification::query()
            ->where('user_id', $this->user($request)->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (UserNotification $notification): array => [
                'id' => $notification->id,
                'title' => $notification->title,
                'message' => $notification->message,
                'kind' => $notification->kind,
                'createdAt' => $notification->created_at?->toISOString(),
                'readAt' => $notification->read_at?->toISOString(),
            ]);

        return response()->json($notifications);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $count = UserNotification::query()
            ->where('user_id', $this->user($request)->id)
            ->whereNull('read_at')
            ->count();

        return response()->json(['count' => $count]);
    }

    public function markRead(Request $request, string $id): \Illuminate\Http\Response
    {
        $notification = UserNotification::query()
            ->whereKey($id)
            ->where('user_id', $this->user($request)->id)
            ->first();
        if (!$notification) {
            throw new ApiException('Notification introuvable.', 404);
        }

        $notification->read_at ??= now();
        $notification->save();

        return response()->noContent();
    }

    public function markAllRead(Request $request): \Illuminate\Http\Response
    {
        DB::table('user_notifications')
            ->where('user_id', $this->user($request)->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->noContent();
    }

    private function user(Request $request): KalyUser
    {
        return $request->attributes->get('kalyUser');
    }
}
