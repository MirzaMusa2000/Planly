<?php

namespace Tests\Feature;

use Tests\TestCase;

class MakeAdminCommandTest extends TestCase
{
    public function test_promotes_existing_firebase_user(): void
    {
        $auth = $this->mockAuth();
        $auth->shouldReceive('findByEmail')->with('me@example.com')
            ->andReturn(['uid' => 'u1', 'email' => 'me@example.com', 'displayName' => 'Me']);
        $auth->shouldReceive('setClaims')->once()->with('u1', true, true);
        $this->mockUsers()->shouldReceive('makeAdmin')->once()->with('u1', 'me@example.com', 'Me');

        $this->artisan('app:make-admin', ['email' => ' Me@Example.com '])
            ->expectsOutputToContain('is now an approved admin')
            ->assertSuccessful();
    }

    public function test_fails_for_unknown_email(): void
    {
        $this->mockAuth()->shouldReceive('findByEmail')->andReturnNull();
        $this->mockUsers()->shouldNotReceive('makeAdmin');

        $this->artisan('app:make-admin', ['email' => 'nobody@example.com'])
            ->expectsOutputToContain('No Firebase user found')
            ->assertFailed();
    }
}
