<?php

namespace Database\Seeders;

use App\Models\KalyUser;
use App\Services\NotificationService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use RuntimeException;

class DemoAccountSeeder extends Seeder
{
    public function run(): void
    {
        if (!app()->environment(['local', 'development']) || !config('kaly.demo_accounts_enabled')) {
            return;
        }

        $adminEmail = mb_strtolower(trim((string) config('kaly.demo_admin_email')));
        $userEmail = mb_strtolower(trim((string) config('kaly.demo_user_email')));
        if ($adminEmail === $userEmail) {
            throw new RuntimeException('Les adresses des comptes de démonstration doivent être différentes.');
        }

        $accounts = [
            [
                'name' => (string) config('kaly.demo_admin_name'),
                'email' => $adminEmail,
                'password' => (string) config('kaly.demo_admin_password'),
                'role' => 'ADMIN',
            ],
            [
                'name' => (string) config('kaly.demo_user_name'),
                'email' => $userEmail,
                'password' => (string) config('kaly.demo_user_password'),
                'role' => 'USER',
            ],
        ];

        foreach ($accounts as $account) {
            if (KalyUser::query()->where('email', $account['email'])->exists()) {
                continue;
            }
            if (mb_strlen($account['password']) < 12 || strlen($account['password']) > 72) {
                throw new RuntimeException('Les mots de passe de démonstration doivent contenir entre 12 et 72 octets.');
            }

            $user = KalyUser::query()->create([
                'id' => (string) Str::uuid(),
                'display_name' => trim($account['name']),
                'email' => $account['email'],
                'password_hash' => password_hash($account['password'], PASSWORD_BCRYPT),
                'role' => $account['role'],
                'enabled' => true,
                'created_at' => now(),
            ]);

            app(NotificationService::class)->create(
                $user->id,
                'Bienvenue sur Kaly',
                'Ce compte de démonstration a été créé pour vérifier les fonctions '.$account['role'].' de Kaly.',
                'account',
            );
        }
    }
}
