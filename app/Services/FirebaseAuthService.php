<?php

namespace App\Services;

use DateTimeInterface;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;
use Kreait\Firebase\Exception\Auth\UserNotFound;
use Kreait\Firebase\Exception\AuthException;
use Kreait\Firebase\Exception\FirebaseException;
use Throwable;

/**
 * Thin wrapper around the Firebase Admin Auth API so controllers, middleware
 * and tests depend on a small, mockable surface.
 */
class FirebaseAuthService
{
    /** Clock-skew allowance when verifying ID tokens (seconds). */
    private const LEEWAY = 60;

    public function __construct(private Auth $auth) {}

    /**
     * Verify a Firebase ID token (including revocation). Returns the useful
     * claims, or null if the token is invalid, expired or revoked.
     *
     * @return array{uid: string, email: ?string, name: ?string, picture: ?string, claims: array<string, mixed>}|null
     */
    public function verifyIdToken(string $idToken): ?array
    {
        try {
            // Revocation is checked separately: kreait also applies the leeway
            // to auth_time, which would reject anyone signing in within LEEWAY
            // seconds after their tokens were revoked.
            $token = $this->auth->verifyIdToken($idToken, false, self::LEEWAY);
            $claims = $token->claims()->all();

            if ($this->wasRevoked((string) $claims['sub'], $claims['auth_time'] ?? null)) {
                return null;
            }
        } catch (FailedToVerifyToken|\InvalidArgumentException) {
            return null;
        } catch (AuthException|FirebaseException $e) {
            report($e);

            return null;
        }

        return [
            'uid' => (string) $claims['sub'],
            'email' => $claims['email'] ?? null,
            'name' => $claims['name'] ?? null,
            'picture' => $claims['picture'] ?? null,
            'claims' => $claims,
        ];
    }

    /** True if the token's sign-in happened before the user's tokens were revoked. */
    private function wasRevoked(string $uid, mixed $authTime): bool
    {
        $validSince = $this->auth->getUser($uid)->tokensValidAfterTime;

        if ($validSince === null) {
            return false;
        }

        $authenticatedAt = $authTime instanceof DateTimeInterface ? $authTime->getTimestamp() : (int) $authTime;

        return $authenticatedAt < $validSince->getTimestamp();
    }

    /**
     * Custom claims Firestore rules rely on. Unapproved users get none.
     *
     * @return array<string, bool>
     */
    public static function claimsFor(bool $approved, bool $admin): array
    {
        if (! $approved) {
            return [];
        }

        return $admin ? ['approved' => true, 'admin' => true] : ['approved' => true];
    }

    public function setClaims(string $uid, bool $approved, bool $admin = false): void
    {
        $this->auth->setCustomUserClaims($uid, self::claimsFor($approved, $admin));
    }

    /** Force every device of this user to sign in again. */
    public function revokeSessions(string $uid): void
    {
        $this->auth->revokeRefreshTokens($uid);
    }

    /**
     * @return array{uid: string, email: string, displayName: ?string}|null
     */
    public function findByEmail(string $email): ?array
    {
        try {
            $user = $this->auth->getUserByEmail($email);
        } catch (UserNotFound) {
            return null;
        } catch (Throwable $e) {
            report($e);

            return null;
        }

        return [
            'uid' => $user->uid,
            'email' => (string) $user->email,
            'displayName' => $user->displayName,
        ];
    }
}
