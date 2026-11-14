<?php

namespace App\Services;

use App\Models\KalyUser;
use RuntimeException;

class JwtService
{
    private string $secret;
    private int $expirationSeconds;

    public function __construct()
    {
        $this->secret = (string) config('kaly.jwt_secret');
        $this->expirationSeconds = (int) config('kaly.jwt_expiration', 43200);

        if (strlen($this->secret) < 32) {
            throw new RuntimeException('KALY_JWT_SECRET doit contenir au moins 32 octets.');
        }
    }

    public function issue(KalyUser $user): string
    {
        $now = time();
        $header = $this->base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $payload = $this->base64UrlEncode(json_encode([
            'sub' => $user->email,
            'role' => $user->role,
            'iat' => $now,
            'exp' => $now + $this->expirationSeconds,
        ], JSON_THROW_ON_ERROR));
        $content = $header.'.'.$payload;
        $signature = $this->base64UrlEncode(hash_hmac('sha256', $content, $this->secret, true));

        return $content.'.'.$signature;
    }

    /**
     * @return array{sub: string, role: string, exp: int}
     */
    public function verify(string $token): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new RuntimeException('Invalid token.');
        }

        [$encodedHeader, $encodedPayload, $providedSignature] = $parts;
        $header = json_decode($this->base64UrlDecode($encodedHeader), true, flags: JSON_THROW_ON_ERROR);
        $claims = json_decode($this->base64UrlDecode($encodedPayload), true, flags: JSON_THROW_ON_ERROR);
        $expectedSignature = $this->base64UrlEncode(
            hash_hmac('sha256', $encodedHeader.'.'.$encodedPayload, $this->secret, true)
        );

        if (($header['alg'] ?? null) !== 'HS256'
            || !hash_equals($expectedSignature, $providedSignature)
            || !is_string($claims['sub'] ?? null)
            || !in_array($claims['role'] ?? null, ['USER', 'ADMIN'], true)
            || !is_int($claims['exp'] ?? null)
            || $claims['exp'] <= time()) {
            throw new RuntimeException('Invalid token.');
        }

        return $claims;
    }

    public function expirationSeconds(): int
    {
        return $this->expirationSeconds;
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if ($decoded === false) {
            throw new RuntimeException('Invalid token encoding.');
        }

        return $decoded;
    }
}
