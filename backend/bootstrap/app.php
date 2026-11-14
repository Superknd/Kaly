<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/actuator/health',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'kaly.auth' => \App\Http\Middleware\AuthenticateKaly::class,
            'kaly.admin' => \App\Http\Middleware\RequireKalyAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (\Throwable $exception, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            $status = 500;
            $message = 'Une erreur interne est survenue.';
            $headers = [];

            if ($exception instanceof \App\Exceptions\ApiException) {
                $status = $exception->status;
                $message = $exception->getMessage();
            } elseif ($exception instanceof ValidationException) {
                $status = 400;
                $message = collect($exception->errors())->flatten()->first()
                    ?? 'Les données fournies sont invalides.';
            } elseif ($exception instanceof ModelNotFoundException) {
                $status = 404;
                $message = 'La ressource demandée est introuvable.';
            } elseif ($exception instanceof HttpExceptionInterface) {
                $status = $exception->getStatusCode();
                $headers = $exception->getHeaders();
                $message = match ($status) {
                    401 => 'Authentification requise.',
                    403 => 'Accès interdit.',
                    404 => 'La ressource demandée est introuvable.',
                    429 => 'Trop de tentatives. Réessayez dans une minute.',
                    413 => 'La taille maximale de la requête est de 100 Mo.',
                    default => 'La requête ne peut pas être traitée.',
                };
            } elseif ($exception instanceof QueryException && ($exception->errorInfo[0] ?? null) === '23000') {
                $status = 409;
                $message = 'Cette opération entre en conflit avec une donnée existante.';
            }

            return response()->json([
                'timestamp' => now()->toISOString(),
                'status' => $status,
                'error' => \Symfony\Component\HttpFoundation\Response::$statusTexts[$status] ?? 'Error',
                'message' => $message,
                'path' => $request->getRequestUri(),
            ], $status, $headers);
        });
    })->create();
