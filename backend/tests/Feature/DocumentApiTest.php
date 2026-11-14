<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\KalyUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use setasign\Fpdi\Fpdi;
use Tests\TestCase;

class DocumentApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['kaly.jwt_secret' => str_repeat('d', 40)]);
        Storage::fake('kaly-documents');
    }

    public function test_upload_stores_a_valid_pdf_and_returns_frontend_metadata(): void
    {
        $user = $this->createUser('upload@example.test');
        $pdf = new Fpdi();
        $pdf->AddPage();

        $response = $this->withToken(app(\App\Services\JwtService::class)->issue($user))
            ->post('/api/documents', [
                'file' => UploadedFile::fake()->createWithContent('report.pdf', $pdf->Output('S')),
            ]);

        $response->assertCreated()
            ->assertJsonPath('name', 'report.pdf')
            ->assertJsonPath('contentType', 'application/pdf')
            ->assertJsonPath('folderId', null);

        $document = Document::query()->findOrFail($response->json('id'));
        Storage::disk('kaly-documents')->assertExists($document->storage_key);
        $this->withToken(app(\App\Services\JwtService::class)->issue($user))
            ->get('/api/documents/'.$document->id.'/content')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_a_user_cannot_download_another_users_document(): void
    {
        $owner = $this->createUser('owner@example.test');
        $other = $this->createUser('other@example.test');
        $document = Document::query()->create([
            'id' => (string) Str::uuid(),
            'original_filename' => 'private.pdf',
            'storage_key' => (string) Str::uuid(),
            'content_type' => 'application/pdf',
            'size_bytes' => 5,
            'created_at' => now(),
            'modified_at' => now(),
            'owner_id' => $other->id,
        ]);
        Storage::disk('kaly-documents')->put($document->storage_key, '%PDF-');
        $token = app(\App\Services\JwtService::class)->issue($owner);

        $this->withToken($token)
            ->getJson('/api/documents/'.$document->id.'/content')
            ->assertNotFound();
    }

    private function createUser(string $email): KalyUser
    {
        return KalyUser::query()->create([
            'id' => (string) Str::uuid(),
            'display_name' => 'Test User',
            'email' => $email,
            'password_hash' => password_hash('long-enough-password', PASSWORD_BCRYPT),
            'role' => 'USER',
            'enabled' => true,
            'created_at' => now(),
        ]);
    }
}
