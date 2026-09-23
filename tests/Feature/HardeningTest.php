<?php

namespace Tests\Feature;

use RuntimeException;
use Tests\TestCase;

class HardeningTest extends TestCase
{
    public function test_security_headers_are_sent(): void
    {
        $this->get('/login')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->assertHeaderMissing('Strict-Transport-Security'); // only over HTTPS
    }

    public function test_hsts_over_https(): void
    {
        $this->get('https://localhost/login')->assertHeader('Strict-Transport-Security');
    }

    public function test_trusts_cloud_run_proxy_for_https(): void
    {
        $this->withHeaders(['X-Forwarded-Proto' => 'https'])
            ->get('/login')
            ->assertHeader('Strict-Transport-Security');
    }

    public function test_firestore_outage_shows_friendly_503(): void
    {
        $users = $this->mockUsers();
        $users->shouldReceive('access')->andThrow(new RuntimeException('connection refused'));
        $this->signIn(users: $users);

        $this->get('/dashboard')
            ->assertStatus(503)
            ->assertSee('Back in a moment')
            ->assertSee('We can’t reach the planner database', false);
    }

    public function test_firestore_outage_during_sign_in_returns_503_json(): void
    {
        $this->mockAuth()->shouldReceive('verifyIdToken')->andReturn($this->tokenPayload());
        $this->mockUsers()->shouldReceive('find')->andThrow(new RuntimeException('connection refused'));

        $this->postJson('/auth/session', ['idToken' => 'tok'])
            ->assertStatus(503)
            ->assertJsonFragment(['message' => 'We can’t reach the planner database right now. Please try again in a minute.']);
    }

    public function test_friendly_404_page(): void
    {
        $this->get('/no-such-page')->assertNotFound()->assertSee('Page not found');
    }

    public function test_friendly_403_page_shows_reason(): void
    {
        $this->signIn('member');

        $this->get('/admin/users')->assertForbidden()->assertSee('Admins only.');
    }

    public function test_browser_gets_runtime_firebase_config(): void
    {
        config(['firebase.web.apiKey' => 'runtime-key', 'firebase.web.projectId' => 'my-proj']);

        $this->get('/login')
            ->assertSee('"apiKey":"runtime-key"', false)
            ->assertSee('"projectId":"my-proj"', false);
    }
}
