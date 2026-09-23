<?php

namespace Tests\Feature;

use Tests\TestCase;

class AuthSessionTest extends TestCase
{
    public function test_login_page_renders_for_guests(): void
    {
        $this->get('/login')->assertOk()->assertSee('Welcome back');
    }

    public function test_login_redirects_signed_in_users_to_dashboard(): void
    {
        $this->signIn();

        $this->get('/login')->assertRedirect('/dashboard');
    }

    public function test_id_token_is_required(): void
    {
        $this->postJson('/auth/session', [])->assertUnprocessable()->assertJsonValidationErrors('idToken');
    }

    public function test_invalid_token_is_rejected(): void
    {
        $this->mockAuth()->shouldReceive('verifyIdToken')->with('bad')->andReturnNull();
        $this->mockUsers()->shouldNotReceive('find');

        $this->postJson('/auth/session', ['idToken' => 'bad'])->assertUnauthorized();
        $this->assertFalse(session()->has('user'));
    }

    public function test_new_user_is_created_as_pending_and_sent_to_pending_page(): void
    {
        $this->mockAuth()->shouldReceive('verifyIdToken')->andReturn($this->tokenPayload(['name' => null]));
        $users = $this->mockUsers();
        $users->shouldReceive('find')->with('uid123')->andReturnNull();
        $users->shouldReceive('createPending')
            ->once()
            ->with('uid123', 'ali@example.com', 'Ali From Form', null)
            ->andReturn($this->userRecord(['status' => 'pending', 'displayName' => 'Ali From Form']));

        $this->postJson('/auth/session', ['idToken' => 'tok', 'displayName' => 'Ali From Form'])
            ->assertOk()
            ->assertJson(['status' => 'pending', 'redirect' => route('pending')]);

        $this->assertFalse(session()->has('user'));
        $this->assertSame('pending', session('pending.status'));

        // ...and cannot reach the dashboard.
        $this->get('/dashboard')->assertRedirect('/login');
        $this->get('/pending')->assertOk()->assertSee('Waiting for admin approval');
    }

    public function test_display_name_falls_back_to_email_prefix(): void
    {
        $this->mockAuth()->shouldReceive('verifyIdToken')->andReturn($this->tokenPayload(['name' => null]));
        $users = $this->mockUsers();
        $users->shouldReceive('find')->andReturnNull();
        $users->shouldReceive('createPending')->once()->with('uid123', 'ali@example.com', 'ali', null)
            ->andReturn($this->userRecord(['status' => 'pending']));

        $this->postJson('/auth/session', ['idToken' => 'tok'])->assertOk();
    }

    public function test_existing_pending_user_goes_to_pending_page(): void
    {
        $this->mockAuth()->shouldReceive('verifyIdToken')->andReturn($this->tokenPayload());
        $users = $this->mockUsers();
        $users->shouldReceive('find')->andReturn($this->userRecord(['status' => 'pending']));
        $users->shouldNotReceive('createPending');

        $this->postJson('/auth/session', ['idToken' => 'tok'])
            ->assertJson(['status' => 'pending', 'redirect' => route('pending')]);
    }

    public function test_rejected_user_sees_access_denied(): void
    {
        $this->mockAuth()->shouldReceive('verifyIdToken')->andReturn($this->tokenPayload());
        $this->mockUsers()->shouldReceive('find')->andReturn($this->userRecord(['status' => 'rejected']));

        $this->postJson('/auth/session', ['idToken' => 'tok'])
            ->assertJson(['status' => 'rejected', 'redirect' => route('pending')]);

        $this->assertFalse(session()->has('user'));
        $this->get('/pending')->assertOk()->assertSee('Access denied');
        $this->get('/dashboard')->assertRedirect('/login');
    }

    public function test_approved_user_gets_a_session(): void
    {
        $this->mockAuth()->shouldReceive('verifyIdToken')->andReturn($this->tokenPayload([], ['approved' => true]))
            ->getMock()->shouldNotReceive('setClaims');
        $users = $this->mockUsers();
        $users->shouldReceive('find')->andReturn($this->userRecord());
        $users->shouldReceive('access')->andReturn(['status' => 'approved', 'role' => 'member']);

        $this->postJson('/auth/session', ['idToken' => 'tok'])
            ->assertOk()
            ->assertJson(['status' => 'approved', 'redirect' => route('dashboard'), 'claimsUpdated' => false]);

        $this->assertSame([
            'uid' => 'uid123',
            'email' => 'ali@example.com',
            'role' => 'member',
            'displayName' => 'Ali',
        ], session('user'));

        $this->get('/dashboard')->assertOk()->assertSee('Hi Ali');
    }

    public function test_missing_claims_are_repaired_for_approved_users(): void
    {
        $auth = $this->mockAuth();
        $auth->shouldReceive('verifyIdToken')->andReturn($this->tokenPayload()); // no claims yet
        $auth->shouldReceive('setClaims')->once()->with('uid123', true, true);
        $this->mockUsers()->shouldReceive('find')->andReturn($this->userRecord(['role' => 'admin']));

        $this->postJson('/auth/session', ['idToken' => 'tok'])->assertJson(['claimsUpdated' => true]);
    }

    public function test_pending_page_without_session_redirects_to_login(): void
    {
        $this->get('/pending')->assertRedirect('/login');
    }

    public function test_logout_clears_the_session(): void
    {
        $this->signIn();

        $this->post('/logout')->assertRedirect('/login')->assertSessionMissing('error');
        $this->assertFalse(session()->has('user'));
    }

    public function test_automatic_logout_after_revoke_explains_why(): void
    {
        $this->signIn();

        $this->post('/logout', ['reason' => 'revoked'])
            ->assertRedirect('/login')
            ->assertSessionHas('error', 'Your access has been revoked.');
    }
}
