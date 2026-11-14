<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireKalyAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->attributes->get('kalyUser')?->role !== 'ADMIN') {
            throw new ApiException('Accès réservé aux administrateurs.', 403);
        }

        return $next($request);
    }
}
