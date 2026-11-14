<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Models\KalyUser;
use App\Services\JwtService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateKaly
{
    public function __construct(private readonly JwtService $jwt)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization', '');

        if (!preg_match('/^Bearer\s+(\S+)$/i', $header, $matches)) {
            throw new ApiException('Authentification requise.', 401);
        }

        try {
            $claims = $this->jwt->verify($matches[1]);
        } catch (\Throwable) {
            throw new ApiException('Session invalide ou expirée.', 401);
        }

        $user = KalyUser::query()
            ->where('email', $claims['sub'])
            ->where('enabled', true)
            ->first();

        if (!$user || $user->role !== $claims['role']) {
            throw new ApiException('Session invalide ou compte désactivé.', 401);
        }

        $request->attributes->set('kalyUser', $user);

        return $next($request);
    }
}
