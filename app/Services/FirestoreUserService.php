<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Google\Cloud\Core\Timestamp;
use Google\Cloud\Firestore\CollectionReference;
use Google\Cloud\Firestore\DocumentSnapshot;
use Google\Cloud\Firestore\FieldValue;
use Illuminate\Support\Facades\Cache;
use Kreait\Firebase\Contract\Firestore;

/**
 * All server-side access to users/{uid}. The Admin SDK bypasses Firestore
 * rules, so callers must check permissions before calling write methods.
 */
class FirestoreUserService
{
    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';

    public const ROLE_ADMIN = 'admin';
    public const ROLE_MEMBER = 'member';

    /** How long a user's status/role is cached for the EnsureApproved check. */
    private const ACCESS_TTL = 60;

    public function __construct(private Firestore $firestore) {}

    /**
     * @return array{uid: string, email: string, displayName: string, photoUrl: ?string, role: string, status: string, createdAt: ?CarbonImmutable, approvedAt: ?CarbonImmutable, approvedBy: ?string}|null
     */
    public function find(string $uid): ?array
    {
        $snapshot = $this->users()->document($uid)->snapshot();

        return $snapshot->exists() ? $this->hydrate($snapshot) : null;
    }

    /**
     * Status and role only, cached briefly. Used on every authenticated request.
     *
     * @return array{status: string, role: string}|null
     */
    public function access(string $uid): ?array
    {
        return Cache::remember($this->accessKey($uid), self::ACCESS_TTL, function () use ($uid) {
            $user = $this->find($uid);

            return $user ? ['status' => $user['status'], 'role' => $user['role']] : null;
        });
    }

    /**
     * All users, newest first. The group is small, so we read the whole
     * collection and sort in PHP (orderBy would skip docs missing the field).
     *
     * @return list<array>
     */
    public function all(): array
    {
        $users = [];
        foreach ($this->users()->documents() as $snapshot) {
            if ($snapshot->exists()) {
                $users[] = $this->hydrate($snapshot);
            }
        }

        usort($users, fn ($a, $b) => ($b['createdAt']?->getTimestamp() ?? 0) <=> ($a['createdAt']?->getTimestamp() ?? 0));

        return $users;
    }

    public function createPending(string $uid, string $email, string $displayName, ?string $photoUrl = null): array
    {
        $this->users()->document($uid)->set([
            'email' => $email,
            'displayName' => $displayName,
            'photoUrl' => $photoUrl,
            'role' => self::ROLE_MEMBER,
            'status' => self::PENDING,
            'createdAt' => FieldValue::serverTimestamp(),
            'approvedAt' => null,
            'approvedBy' => null,
            'lastReadChatAt' => null,
        ]);
        $this->forgetAccess($uid);

        return $this->find($uid);
    }

    public function approve(string $uid, string $approvedBy): void
    {
        $this->users()->document($uid)->update([
            ['path' => 'status', 'value' => self::APPROVED],
            ['path' => 'approvedAt', 'value' => FieldValue::serverTimestamp()],
            ['path' => 'approvedBy', 'value' => $approvedBy],
        ]);
        $this->forgetAccess($uid);
    }

    /** Used for both reject (pending → rejected) and revoke (approved → rejected). */
    public function reject(string $uid): void
    {
        $this->users()->document($uid)->update([
            ['path' => 'status', 'value' => self::REJECTED],
        ]);
        $this->forgetAccess($uid);
    }

    /** Create or promote a user to an approved admin (bootstrap command). */
    public function makeAdmin(string $uid, string $email, ?string $displayName = null): void
    {
        $doc = $this->users()->document($uid);
        $exists = $doc->snapshot()->exists();

        $data = [
            'email' => $email,
            'role' => self::ROLE_ADMIN,
            'status' => self::APPROVED,
            'approvedAt' => FieldValue::serverTimestamp(),
            'approvedBy' => $uid,
        ];

        if (! $exists) {
            $data += [
                'displayName' => $displayName ?: strstr($email, '@', true),
                'photoUrl' => null,
                'createdAt' => FieldValue::serverTimestamp(),
                'lastReadChatAt' => null,
            ];
        }

        $doc->set($data, ['merge' => true]);
        $this->forgetAccess($uid);
    }

    public function forgetAccess(string $uid): void
    {
        Cache::forget($this->accessKey($uid));
    }

    private function accessKey(string $uid): string
    {
        return "planly:user-access:{$uid}";
    }

    private function users(): CollectionReference
    {
        return $this->firestore->database()->collection('users');
    }

    private function hydrate(DocumentSnapshot $snapshot): array
    {
        $d = $snapshot->data();

        return [
            'uid' => $snapshot->id(),
            'email' => (string) ($d['email'] ?? ''),
            'displayName' => (string) ($d['displayName'] ?? ''),
            'photoUrl' => $d['photoUrl'] ?? null,
            'role' => $d['role'] ?? self::ROLE_MEMBER,
            'status' => $d['status'] ?? self::PENDING,
            'createdAt' => $this->toDate($d['createdAt'] ?? null),
            'approvedAt' => $this->toDate($d['approvedAt'] ?? null),
            'approvedBy' => $d['approvedBy'] ?? null,
        ];
    }

    private function toDate(mixed $value): ?CarbonImmutable
    {
        return $value instanceof Timestamp
            ? CarbonImmutable::instance($value->get())->setTimezone(config('app.timezone'))
            : null;
    }
}
