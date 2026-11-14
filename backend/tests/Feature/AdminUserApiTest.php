<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Folder;
use App\Models\KalyUser;
use App\Services\JwtService;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminUserApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['kaly.jwt_secret' => str_repeat('k', 40)]);
    }

    public function test_admin_stats_and_account_activity_return_aggregate_usage_only(): void
    {
        $admin = $this->createUser('ADMIN', 'admin@example.test');
        $user = $this->createUser('USER', 'member@example.test');
        $folder = Folder::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Private folder',
            'created_at' => now(),
            'owner_id' => $user->id,
        ]);
        Document::query()->create([
            'id' => (string) Str::uuid(),
            'original_filename' => 'private-document.pdf',
            'storage_key' => (string) Str::uuid(),
            'content_type' => 'application/pdf',
            'size_bytes' => 1536,
            'created_at' => now(),
            'modified_at' => now(),
            'owner_id' => $user->id,
            'folder_id' => $folder->id,
        ]);
        app(NotificationService::class)->create($user->id, 'Welcome', 'Welcome message', 'account');
        $token = app(JwtService::class)->issue($admin);

        $this->withToken($token)
            ->getJson('/api/admin/stats')
            ->assertOk()
            ->assertJsonPath('users.total', 2)
            ->assertJsonPath('users.active', 2)
            ->assertJsonPath('users.admins', 1)
            ->assertJsonPath('users.members', 1)
            ->assertJsonPath('documents.total', 1)
            ->assertJsonPath('documents.storageBytes', 1536)
            ->assertJsonPath('folders.total', 1)
            ->assertJsonPath('notifications.total', 1)
            ->assertJsonPath('notifications.unread', 1)
            ->assertJsonCount(30, 'trends.usersCreated')
            ->assertJsonPath('trends.usersCreated.29.count', 2)
            ->assertJsonPath('trends.documentsCreated.29.storageBytes', 1536);

        $this->withToken($token)
            ->getJson('/api/admin/users/'.$user->id.'/activity')
            ->assertOk()
            ->assertJsonPath('userId', $user->id)
            ->assertJsonPath('documents', 1)
            ->assertJsonPath('storageBytes', 1536)
            ->assertJsonPath('folders', 1)
            ->assertJsonPath('notifications', 1)
            ->assertJsonMissing(['name' => 'private-document.pdf']);
    }

    public function test_admin_can_change_another_users_role_but_not_their_own(): void
    {
        $admin = $this->createUser('ADMIN', 'admin@example.test');
        $user = $this->createUser('USER', 'member@example.test');
        $userToken = app(JwtService::class)->issue($user);
        $adminToken = app(JwtService::class)->issue($admin);

        $this->withToken($adminToken)
            ->patchJson('/api/admin/users/'.$user->id.'/role', ['role' => 'ADMIN'])
            ->assertOk()
            ->assertJsonPath('role', 'ADMIN');

        $this->withToken($userToken)->getJson('/api/auth/me')->assertUnauthorized();

        $this->withToken($adminToken)
            ->patchJson('/api/admin/users/'.$admin->id.'/role', ['role' => 'USER'])
            ->assertBadRequest();
    }

    public function test_admin_password_reset_sends_a_hashed_single_use_email_token(): void
    {
        config([
            'kaly.password_reset_enabled' => true,
            'kaly.frontend_url' => 'http://localhost:4200/',
        ]);
        $admin = $this->createUser('ADMIN', 'admin@example.test');
        $user = $this->createUser('USER', 'member@example.test');
        $rawToken = null;
        Mail::shouldReceive('raw')->once()->withArgs(function (string $body) use (&$rawToken): bool {
            preg_match('/resetToken=([^\\s&]+)/', $body, $matches);
            $rawToken = $matches[1] ?? null;

            return $rawToken !== null;
        });

        $this->withToken(app(JwtService::class)->issue($admin))
            ->postJson('/api/admin/users/'.$user->id.'/password-reset')
            ->assertAccepted()
            ->assertJsonPath('message', 'Le lien de réinitialisation a été envoyé par e-mail.')
            ->assertJsonMissing(['token' => $rawToken]);

        $savedToken = DB::table('password_reset_tokens')->first();
        $this->assertNotNull($rawToken);
        $this->assertSame(hash('sha256', $rawToken), $savedToken->token_hash);
        $this->assertDatabaseHas('user_notifications', [
            'user_id' => $user->id,
            'kind' => 'security',
        ]);
    }

    public function test_admin_password_reset_email_requests_are_rate_limited(): void
    {
        config(['kaly.password_reset_enabled' => true]);
        $admin = $this->createUser('ADMIN', 'admin@example.test');
        $user = $this->createUser('USER', 'member@example.test');
        Mail::shouldReceive('raw')->times(5)->andReturnNull();
        $request = $this->withToken(app(JwtService::class)->issue($admin));

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $request->postJson('/api/admin/users/'.$user->id.'/password-reset')->assertAccepted();
        }

        $request->postJson('/api/admin/users/'.$user->id.'/password-reset')->assertTooManyRequests();
    }

    public function test_admin_features_remain_forbidden_to_regular_users(): void
    {
        $user = $this->createUser('USER', 'member@example.test');
        $token = app(JwtService::class)->issue($user);

        $this->withToken($token)->getJson('/api/admin/stats')->assertForbidden();
        $this->withToken($token)->getJson('/api/admin/users/'.$user->id.'/activity')->assertForbidden();
        $this->withToken($token)->patchJson('/api/admin/users/'.$user->id.'/role', ['role' => 'ADMIN'])
            ->assertForbidden();
        $this->withToken($token)->postJson('/api/admin/users/'.$user->id.'/password-reset')
            ->assertForbidden();
    }

    private function createUser(string $role, string $email): KalyUser
    {
        return KalyUser::query()->create([
            'id' => (string) Str::uuid(),
            'display_name' => ucfirst($role).' Test',
            'email' => $email,
            'password_hash' => password_hash('long-enough-password', PASSWORD_BCRYPT),
            'role' => $role,
            'enabled' => true,
            'created_at' => now(),
        ]);
    }
}
