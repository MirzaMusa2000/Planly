<?php

namespace App\Http\Middleware;

use App\Services\FirestoreUserService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

/**
 * Requires a Laravel session for an approved member or admin.
 *
 * The user's status is re-checked against Firestore (cached ~60s), so a user
 * who is rejected or revoked mid-session is logged out on their next request.
 */
class EnsureApproved
{
    public function __construct(private FirestoreUserService $users) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->session()->get('user');

        if (! is_array($user) || ! in_array($user['role'] ?? null, [FirestoreUserService::ROLE_MEMBER, FirestoreUserService::ROLE_ADMIN], true)) {
            return $this->deny($request);
        }

        $access = $this->users->access($user['uid']);

        if ($access === null || $access['status'] !== FirestoreUserService::APPROVED) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return $this->deny($request, $access === null ? null : 'Your access has been revoked.');
        }

        // Pick up role changes (e.g. promoted to admin) without a re-login.
        if ($access['role'] !== $user['role']) {
            $user['role'] = $access['role'];
            $request->session()->put('user', $user);
        }

        View::share('currentUser', $user);

        return $next($request);
    }

    private function deny(Request $request, ?string $message = null): Response
    {
        if ($request->expectsJson()) {
            return response()->json(['message' => $message ?? 'Unauthenticated.'], 401);
        }

        $redirect = redirect()->route('login');

        return $message ? $redirect->with('error', $message) : $redirect;
    }
}
