<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\KalyUser;
use App\Services\NotificationService;
use App\Services\PasswordResetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    public function __construct(
        private readonly NotificationService $notifications,
        private readonly PasswordResetService $passwordResets,
    ) {}

    public function stats(): JsonResponse
    {
        $start = now()->startOfDay()->subDays(29);
        $usersByDay = DB::table('app_users')
            ->selectRaw('DATE(created_at) as day, COUNT(*) as count')
            ->where('created_at', '>=', $start)
            ->groupByRaw('DATE(created_at)')
            ->pluck('count', 'day');
        $documentsByDay = DB::table('documents')
            ->selectRaw('DATE(created_at) as day, COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as storage_bytes')
            ->where('created_at', '>=', $start)
            ->groupByRaw('DATE(created_at)')
            ->get()
            ->keyBy('day');

        $userTrend = [];
        $documentTrend = [];
        for ($offset = 0; $offset < 30; $offset++) {
            $day = $start->copy()->addDays($offset)->toDateString();
            $documentRow = $documentsByDay->get($day);
            $userTrend[] = ['date' => $day, 'count' => (int) $usersByDay->get($day, 0)];
            $documentTrend[] = [
                'date' => $day,
                'count' => (int) ($documentRow->count ?? 0),
                'storageBytes' => (int) ($documentRow->storage_bytes ?? 0),
            ];
        }

        return response()->json([
            'users' => [
                'total' => KalyUser::query()->count(),
                'active' => KalyUser::query()->where('enabled', true)->count(),
                'disabled' => KalyUser::query()->where('enabled', false)->count(),
                'admins' => KalyUser::query()->where('role', 'ADMIN')->count(),
                'members' => KalyUser::query()->where('role', 'USER')->count(),
            ],
            'documents' => [
                'total' => DB::table('documents')->count(),
                'storageBytes' => (int) DB::table('documents')->sum('size_bytes'),
            ],
            'folders' => ['total' => DB::table('folders')->count()],
            'notifications' => [
                'total' => DB::table('user_notifications')->count(),
                'unread' => DB::table('user_notifications')->whereNull('read_at')->count(),
            ],
            'trends' => [
                'usersCreated' => $userTrend,
                'documentsCreated' => $documentTrend,
            ],
        ]);
    }

    public function index(): JsonResponse
    {
        $users = KalyUser::query()
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (KalyUser $user): array => $this->userResponse($user));

        return response()->json($users);
    }

    public function store(Request $request): JsonResponse
    {
        $input = $request->validate([
            'displayName' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', 'max:254'],
            'password' => ['required', 'string', 'min:10', 'max:72'],
            'role' => ['required', Rule::in(['USER', 'ADMIN'])],
        ]);
        $this->validatePasswordBytes($input['password']);

        $user = KalyUser::query()->create([
            'id' => (string) Str::uuid(),
            'display_name' => trim($input['displayName']),
            'email' => mb_strtolower(trim($input['email'])),
            'password_hash' => password_hash($input['password'], PASSWORD_BCRYPT),
            'role' => $input['role'],
            'enabled' => true,
            'created_at' => now(),
        ]);

        $this->notifications->create(
            $user->id,
            'Compte Kaly créé',
            'Un administrateur a créé votre compte Kaly.',
            'account',
        );

        return response()->json($this->userResponse($user), 201);
    }

    public function activity(string $id): JsonResponse
    {
        $user = KalyUser::query()->whereKey($id)->first();
        if (! $user) {
            throw new ApiException('Compte utilisateur introuvable.', 404);
        }

        $documentUsage = DB::table('documents')
            ->where('owner_id', $user->id)
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as storage_bytes')
            ->first();

        return response()->json([
            'userId' => $user->id,
            'documents' => (int) $documentUsage->count,
            'storageBytes' => (int) $documentUsage->storage_bytes,
            'folders' => DB::table('folders')->where('owner_id', $user->id)->count(),
            'notifications' => DB::table('user_notifications')->where('user_id', $user->id)->count(),
        ]);
    }

    public function setRole(Request $request, string $id): JsonResponse
    {
        $input = $request->validate(['role' => ['required', Rule::in(['USER', 'ADMIN'])]]);
        $actor = $request->attributes->get('kalyUser');

        $user = DB::transaction(function () use ($id, $input, $actor): KalyUser {
            $user = KalyUser::query()->whereKey($id)->lockForUpdate()->first();
            if (! $user) {
                throw new ApiException('Compte utilisateur introuvable.', 404);
            }

            $role = $input['role'];
            if ($actor->id === $user->id && $user->role !== $role) {
                throw new ApiException('Vous ne pouvez pas modifier votre propre rôle.', 400);
            }
            if ($user->enabled && $user->role === 'ADMIN' && $role !== 'ADMIN') {
                $activeAdmins = KalyUser::query()
                    ->where('role', 'ADMIN')
                    ->where('enabled', true)
                    ->lockForUpdate()
                    ->count();
                if ($activeAdmins <= 1) {
                    throw new ApiException('Le dernier compte administrateur actif ne peut pas être rétrogradé.', 409);
                }
            }

            if ($user->role !== $role) {
                $user->role = $role;
                $user->save();
                $this->notifications->create(
                    $user->id,
                    'Rôle du compte modifié',
                    $role === 'ADMIN'
                        ? 'Votre compte dispose maintenant des droits administrateur.'
                        : 'Les droits de votre compte ont été modifiés.',
                    'account',
                );
            }

            return $user;
        });

        return response()->json($this->userResponse($user));
    }

    public function sendPasswordReset(string $id): JsonResponse
    {
        if (! config('kaly.password_reset_enabled')) {
            throw new ApiException('La récupération de mot de passe n’est pas configurée sur cette instance.', 503);
        }

        $user = KalyUser::query()->whereKey($id)->first();
        if (! $user) {
            throw new ApiException('Compte utilisateur introuvable.', 404);
        }
        if (! $user->enabled) {
            throw new ApiException('Réactivez le compte avant de demander une réinitialisation.', 409);
        }

        $this->passwordResets->sendLink($user);
        $this->notifications->create(
            $user->id,
            'Réinitialisation du mot de passe',
            'Un administrateur a demandé l’envoi d’un lien de réinitialisation.',
            'security',
        );

        return response()->json(['message' => 'Le lien de réinitialisation a été envoyé par e-mail.'], 202);
    }

    public function setEnabled(Request $request, string $id): JsonResponse
    {
        $input = $request->validate(['enabled' => ['required', 'boolean']]);
        $actor = $request->attributes->get('kalyUser');

        $user = DB::transaction(function () use ($id, $input, $actor): KalyUser {
            $activeAdmins = KalyUser::query()
                ->where('role', 'ADMIN')
                ->where('enabled', true)
                ->lockForUpdate()
                ->get();
            $user = KalyUser::query()->whereKey($id)->lockForUpdate()->first();
            if (! $user) {
                throw new ApiException('Compte utilisateur introuvable.', 404);
            }

            $enabled = (bool) $input['enabled'];
            if (! $enabled && $actor->id === $user->id) {
                throw new ApiException('Vous ne pouvez pas désactiver votre propre compte.', 400);
            }
            if (! $enabled && $user->role === 'ADMIN' && $user->enabled
                && $activeAdmins->count() <= 1) {
                throw new ApiException('Le dernier compte administrateur actif ne peut pas être désactivé.', 409);
            }

            if ((bool) $user->enabled !== $enabled) {
                $user->enabled = $enabled;
                $user->save();
                $this->notifications->create(
                    $user->id,
                    $enabled ? 'Compte réactivé' : 'Compte désactivé',
                    $enabled
                        ? 'Votre accès à Kaly a été réactivé par un administrateur.'
                        : 'Votre accès à Kaly a été désactivé par un administrateur.',
                    'account',
                );
            }

            return $user;
        });

        return response()->json($this->userResponse($user));
    }

    private function userResponse(KalyUser $user): array
    {
        return [
            'id' => $user->id,
            'displayName' => $user->display_name,
            'email' => $user->email,
            'role' => $user->role,
            'enabled' => (bool) $user->enabled,
            'createdAt' => $user->created_at?->toISOString(),
        ];
    }

    private function validatePasswordBytes(string $password): void
    {
        if (strlen($password) > 72) {
            throw new ApiException('Le mot de passe ne peut pas dépasser 72 octets UTF-8.', 400);
        }
    }
}
