<?php

namespace App\Http\Controllers;

use App\Services\FirebaseAuthService;
use App\Services\FirestoreUserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\View\View;

class AuthController extends Controller
{
    public function __construct(
        private FirebaseAuthService $auth,
        private FirestoreUserService $users,
    ) {}

    public function showLogin(Request $request): View|RedirectResponse
    {
        if ($request->session()->has('user')) {
            return redirect()->route('dashboard');
        }

        return view('auth.login');
    }

    /**
     * Exchange a Firebase ID token for a Laravel session.
     */
    public function createSession(Request $request): JsonResponse
    {
        $data = $request->validate([
            'idToken' => ['required', 'string', 'max:4096'],
            'displayName' => ['nullable', 'string', 'max:60'],
        ]);

        $token = $this->auth->verifyIdToken($data['idToken']);

        if ($token === null) {
            return response()->json(['message' => 'Your sign-in has expired. Please sign in again.'], 401);
        }

        if (empty($token['email'])) {
            return response()->json(['message' => 'An email address is required.'], 422);
        }

        $user = $this->users->find($token['uid']) ?? $this->users->createPending(
            $token['uid'],
            $token['email'],
            $this->displayName($token, $data['displayName'] ?? null),
            $token['picture'],
        );

        $request->session()->regenerate();
        $request->session()->forget(['user', 'pending']);

        if ($user['status'] !== FirestoreUserService::APPROVED) {
            $request->session()->put('pending', [
                'uid' => $user['uid'],
                'email' => $user['email'],
                'displayName' => $user['displayName'],
                'status' => $user['status'],
            ]);

            return response()->json(['status' => $user['status'], 'redirect' => route('pending')]);
        }

        $isAdmin = $user['role'] === FirestoreUserService::ROLE_ADMIN;

        // Self-heal: make sure the token claims match Firestore, so the
        // browser's realtime listeners pass the security rules.
        $claimsUpdated = false;
        if (($token['claims']['approved'] ?? false) !== true || ($token['claims']['admin'] ?? false) !== $isAdmin) {
            $this->auth->setClaims($user['uid'], true, $isAdmin);
            $claimsUpdated = true;
        }

        $request->session()->put('user', [
            'uid' => $user['uid'],
            'email' => $user['email'],
            'role' => $user['role'],
            'displayName' => $user['displayName'],
        ]);

        return response()->json([
            'status' => $user['status'],
            'redirect' => route('dashboard'),
            'claimsUpdated' => $claimsUpdated,
        ]);
    }

    public function pending(Request $request): View|RedirectResponse
    {
        if ($request->session()->has('user')) {
            return redirect()->route('dashboard');
        }

        $pending = $request->session()->get('pending');

        if (! $pending) {
            return redirect()->route('login');
        }

        return view('auth.pending', ['pending' => $pending]);
    }

    public function logout(Request $request): RedirectResponse|JsonResponse
    {
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if ($request->expectsJson()) {
            return response()->json(['redirect' => route('login')]);
        }

        $redirect = redirect()->route('login');

        // Set by the browser's session guard when it logs out automatically.
        return $request->input('reason') === 'revoked'
            ? $redirect->with('error', 'Your access has been revoked.')
            : $redirect;
    }

    private function displayName(array $token, ?string $requested): string
    {
        $name = trim((string) ($token['name'] ?: $requested));

        return Str::limit($name !== '' ? $name : Str::before($token['email'], '@'), 60, '');
    }
}
