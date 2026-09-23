<?php

namespace Tests;

use App\Services\FirebaseAuthService;
use App\Services\FirestoreUserService;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Mockery\MockInterface;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    /** A users/{uid} record as returned by FirestoreUserService. */
    protected function userRecord(array $overrides = []): array
    {
        return array_merge([
            'uid' => 'uid123',
            'email' => 'ali@example.com',
            'displayName' => 'Ali',
            'photoUrl' => null,
            'role' => 'member',
            'status' => 'approved',
            'createdAt' => null,
            'approvedAt' => null,
            'approvedBy' => null,
        ], $overrides);
    }

    /** A verified-token payload as returned by FirebaseAuthService::verifyIdToken(). */
    protected function tokenPayload(array $overrides = [], array $claims = []): array
    {
        return array_merge([
            'uid' => 'uid123',
            'email' => 'ali@example.com',
            'name' => 'Ali',
            'picture' => null,
            'claims' => array_merge(['sub' => 'uid123'], $claims),
        ], $overrides);
    }

    protected function mockUsers(): MockInterface
    {
        return $this->mock(FirestoreUserService::class);
    }

    protected function mockAuth(): MockInterface
    {
        return $this->mock(FirebaseAuthService::class);
    }

    /**
     * Log in with a Laravel session and make EnsureApproved's live status
     * check return the given status/role.
     */
    protected function signIn(string $role = 'member', string $uid = 'uid123', ?MockInterface $users = null, string $status = 'approved'): MockInterface
    {
        $users ??= $this->mockUsers();
        $users->shouldReceive('access')->with($uid)->andReturn(['status' => $status, 'role' => $role])->byDefault();

        $this->withSession(['user' => [
            'uid' => $uid,
            'email' => "{$uid}@example.com",
            'role' => $role,
            'displayName' => ucfirst($role),
        ]]);

        return $users;
    }
}
