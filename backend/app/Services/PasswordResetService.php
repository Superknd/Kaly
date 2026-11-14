<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\KalyUser;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

class PasswordResetService
{
    public function sendLink(KalyUser $user): void
    {
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
                .'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.';

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
}
