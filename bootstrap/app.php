<?php

use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsureApproved;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Behind Cloud Run / Firebase Hosting: trust X-Forwarded-* so HTTPS,
        // client IPs and secure cookies are detected correctly.
        $middleware->trustProxies(at: '*');

        $middleware->web(append: [SecurityHeaders::class]);

        $middleware->alias([
            'approved' => EnsureApproved::class,
            'admin' => EnsureAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
