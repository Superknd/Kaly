<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\KalyUser;
use App\Services\JwtService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

class AuthController extends Controller
{
    public function __construct(
        private readonly JwtService $jwt,
        private readonly NotificationService $notifications,
    ) {
    }

    public function register(Request $request): JsonResponse
    {
        $input = $request->validate([
            'email' => ['required', 'string', 'email', 'max:254'],
            'password' => ['required', 'string', 'min:10', 'max:72'],
            'displayName' => ['required', 'string', 'max:100'],
        ]);
        $this->validatePasswordBytes($input['password']);

        $user = KalyUser::query()->create([
            'id' => (string) Str::uuid(),
            'display_name' => trim($input['displayName']),
            'email' => mb_strtolower(trim($input['email'])),
            'password_hash' => password_hash($input['password'], PASSWORD_BCRYPT),
            'role' => 'USER',
            'enabled' => true,
            'created_at' => now(),
        ]);

        $this->notifications->create(
            $user->id,
            'Bienvenue sur Kaly',
            'Votre compte est prêt. Vous pouvez commencer à organiser vos documents.',
            'account',
        );

        return response()->json($this->authResponse($user), 201);
    }

    public function login(Request $request): JsonResponse
    {
        $input = $request->validate([
            'email' => ['required', 'string', 'email', 'max:254'],
            'password' => ['required', 'string', 'max:72'],
        ]);

        $user = KalyUser::query()
            ->where('email', mb_strtolower(trim($input['email'])))
            ->first();

        if (!$user || !$user->enabled || !password_verify($input['password'], $user->password_hash)) {
            throw new ApiException('Adresse e-mail ou mot de passe incorrect.', 401);
        }

        return response()->json($this->authResponse($user));
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->userResponse($request->attributes->get('kalyUser')));
    }

    public function requestPasswordReset(Request $request): JsonResponse
    {
        $input = $request->validate([
            'email' => ['required', 'string', 'email', 'max:254'],
        ]);

        if (!config('kaly.password_reset_enabled')) {
            throw new ApiException('La récupération de mot de passe n’est pas configurée sur cette instance.', 503);
        }

        $message = 'Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé.';
        $user = KalyUser::query()
            ->where('email', mb_strtolower(trim($input['email'])))
            ->first();

        if ($user) {
            $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $now = now();

            DB::transaction(function () use ($user, $token, $now): void {
                DB::table('password_reset_tokens')->where('expires_at', '<', $now)->delete();
                DB::table('password_reset_tokens')->where('user_id', $user->id)->delete();
                DB::table('password_reset_tokens')->insert([
                    'id' => (string) Str::uuid(),
                    'token_hash' => hash('sha256', $token),
                    'user_id' => $user->id,
                    'created_at' => $now,
                    'expires_at' => $now->copy()->addMinutes(30),
                ]);

                $separator = str_contains((string) config('kaly.frontend_url'), '?') ? '&' : '?';
                $url = rtrim((string) config('kaly.frontend_url'), '&?')
                    .$separator.http_build_query(['resetToken' => $token]);
                $text = "Bonjour {$user->display_name},\n\n"
                    ."Une demande de réinitialisation du mot de passe de votre compte Kaly a été reçue.\n"
                    ."Utilisez ce lien dans les 30 prochaines minutes :\n\n{$url}\n\n"
                    ."Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.";

                try {
                    Mail::raw($text, function ($mail) use ($user): void {
                        $mail->from(config('kaly.mail_from'))
                            ->to($user->email)
                            ->subject('Réinitialisation de votre mot de passe Kaly');
                    });
                } catch (Throwable $exception) {
                    report($exception);
                    throw new ApiException('Le service d’envoi d’e-mails est indisponible. Réessayez plus tard.', 503);
                }
            });
        }

        return response()->json(['message' => $message], 202);
    }

    public function confirmPasswordReset(Request $request): \Illuminate\Http\Response
    {
        $input = $request->validate([
            'token' => ['required', 'string', 'max:128'],
            'password' => ['required', 'string', 'min:10', 'max:72'],
        ]);
        $this->validatePasswordBytes($input['password']);

        if (!config('kaly.password_reset_enabled')) {
            throw new ApiException('La récupération de mot de passe n’est pas configurée sur cette instance.', 503);
        }

        DB::transaction(function () use ($input): void {
            $token = DB::table('password_reset_tokens')
                ->where('token_hash', hash('sha256', $input['token']))
                ->lockForUpdate()
                ->first();

            if (!$token || $token->used_at !== null || now()->greaterThanOrEqualTo($token->expires_at)) {
                throw new ApiException('Ce lien de réinitialisation est invalide ou a expiré.', 400);
            }

            DB::table('password_reset_tokens')
                ->where('id', $token->id)
                ->whereNull('used_at')
                ->update(['used_at' => now()]);

            KalyUser::query()->whereKey($token->user_id)->update([
                'password_hash' => password_hash($input['password'], PASSWORD_BCRYPT),
            ]);
            DB::table('password_reset_tokens')->where('user_id', $token->user_id)->delete();
            $this->notifications->create(
                $token->user_id,
                'Mot de passe modifié',
                'Le mot de passe de votre compte Kaly a été modifié.',
                'security',
            );
        });

        return response()->noContent();
    }

    private function authResponse(KalyUser $user): array
    {
        return [
            'token' => $this->jwt->issue($user),
            'expiresInSeconds' => $this->jwt->expirationSeconds(),
            'user' => $this->userResponse($user),
        ];
    }

    private function userResponse(KalyUser $user): array
    {
        return [
            'id' => $user->id,
            'displayName' => $user->display_name,
            'email' => $user->email,
            'role' => $user->role,
        ];
    }

    private function validatePasswordBytes(string $password): void
    {
        if (strlen($password) > 72) {
            throw new ApiException('Le mot de passe ne peut pas dépasser 72 octets UTF-8.', 400);
        }
    }
}
