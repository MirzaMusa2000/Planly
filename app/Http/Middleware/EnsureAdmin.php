<?php

namespace App\Http\Middleware;

use App\Services\FirestoreUserService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Requires the session role to be admin. Register after EnsureApproved, which
 * keeps the session role in sync with Firestore.
 */
class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(
            $request->session()->get('user.role') === FirestoreUserService::ROLE_ADMIN,
            403,
            'Admins only.'
        );

        return $next($request);
    }
}
