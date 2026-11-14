<?php

namespace Tests\Feature;

use App\Models\KalyUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['kaly.jwt_secret' => str_repeat('k', 40)]);
    }

    public function test_registration_returns_a_compatible_jwt_session_and_welcome_notification(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'displayName' => ' Kaly Member ',
            'email' => 'Member@Example.test',
            'password' => 'long-enough-password',
        ]);

        $response->assertCreated()
            ->assertJsonPath('user.displayName', 'Kaly Member')
            ->assertJsonPath('user.email', 'member@example.test')
            ->assertJsonPath('user.role', 'USER')
            ->assertJsonPath('expiresInSeconds', 43200)
            ->assertJsonStructure(['token', 'user' => ['id', 'displayName', 'email', 'role']]);

        $token = $response->json('token');
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('id', $response->json('user.id'));

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('0.kind', 'account');
    }

    public function test_login_accepts_existing_java_bcrypt_password_hashes(): void
    {
        $password = 'existing-java-password';
        $javaCompatibleHash = str_replace('$2y$', '$2a$', password_hash($password, PASSWORD_BCRYPT));
        KalyUser::query()->create([
            'id' => '0f66e652-dc1e-4e31-b799-08e9b23a7d00',
            'display_name' => 'Existing User',
            'email' => 'existing@example.test',
            'password_hash' => $javaCompatibleHash,
            'role' => 'USER',
            'enabled' => true,
            'created_at' => now(),
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'EXISTING@example.test',
            'password' => $password,
        ])->assertOk()->assertJsonPath('user.email', 'existing@example.test');
    }

    public function test_protected_api_returns_the_legacy_error_shape_for_missing_authentication(): void
    {
        $this->getJson('/api/documents')
            ->assertUnauthorized()
            ->assertJsonStructure(['timestamp', 'status', 'error', 'message', 'path']);
    }

    public function test_duplicate_folder_names_are_rejected_per_owner(): void
    {
        $user = KalyUser::query()->create([
            'id' => '0f66e652-dc1e-4e31-b799-08e9b23a7d00',
            'display_name' => 'Folder Owner',
            'email' => 'owner@example.test',
            'password_hash' => password_hash('long-enough-password', PASSWORD_BCRYPT),
            'role' => 'USER',
            'enabled' => true,
            'created_at' => now(),
        ]);
        $token = app(\App\Services\JwtService::class)->issue($user);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/folders', ['name' => 'Scans'])
            ->assertCreated();
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/folders', ['name' => 'Scans'])
            ->assertStatus(409);
    }

    public function test_password_reset_tokens_are_hashed_single_use_and_expire_after_thirty_minutes(): void
    {
        config([
            'kaly.password_reset_enabled' => true,
            'kaly.frontend_url' => 'http://localhost:4200/',
        ]);
        KalyUser::query()->create([
            'id' => (string) Str::uuid(),
            'display_name' => 'Reset User',
            'email' => 'reset@example.test',
            'password_hash' => password_hash('old-password-value', PASSWORD_BCRYPT),
            'role' => 'USER',
            'enabled' => true,
            'created_at' => now(),
        ]);
        $rawToken = null;
        Mail::shouldReceive('raw')->once()->withArgs(function (string $body) use (&$rawToken): bool {
            preg_match('/resetToken=([^\\s&]+)/', $body, $matches);
            $rawToken = $matches[1] ?? null;

            return $rawToken !== null;
        });

        $this->postJson('/api/auth/password-reset', ['email' => 'reset@example.test'])
            ->assertAccepted()
            ->assertJsonStructure(['message']);

        $savedToken = DB::table('password_reset_tokens')->first();
        $this->assertNotNull($rawToken);
        $this->assertSame(hash('sha256', $rawToken), $savedToken->token_hash);
        $this->assertEqualsWithDelta(
            1800,
            now()->diffInSeconds(\Illuminate\Support\Carbon::parse($savedToken->expires_at)),
            1.0,
        );

        $this->postJson('/api/auth/password-reset/confirm', [
            'token' => $rawToken,
            'password' => 'new-password-value',
        ])->assertNoContent();
        $this->postJson('/api/auth/password-reset/confirm', [
            'token' => $rawToken,
            'password' => 'another-password-value',
        ])->assertBadRequest();
    }

    public function test_admin_routes_reject_regular_users(): void
    {
        $user = KalyUser::query()->create([
            'id' => (string) Str::uuid(),
            'display_name' => 'Regular User',
            'email' => 'regular@example.test',
            'password_hash' => password_hash('long-enough-password', PASSWORD_BCRYPT),
            'role' => 'USER',
            'enabled' => true,
            'created_at' => now(),
        ]);
        $token = app(\App\Services\JwtService::class)->issue($user);

        $this->withToken($token)
            ->getJson('/api/admin/users')
            ->assertForbidden();
    }
}
