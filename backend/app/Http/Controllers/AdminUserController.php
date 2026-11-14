<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\KalyUser;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    public function __construct(private readonly NotificationService $notifications)
    {
    }

    public function index(): JsonResponse
    {
        $users = KalyUser::query()
            ->orderBy('created_at')
            ->limit(100)
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
            if (!$user) {
                throw new ApiException('Compte utilisateur introuvable.', 404);
            }

            $enabled = (bool) $input['enabled'];
            if (!$enabled && $actor->id === $user->id) {
                throw new ApiException('Vous ne pouvez pas désactiver votre propre compte.', 400);
            }
            if (!$enabled && $user->role === 'ADMIN' && $user->enabled
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
