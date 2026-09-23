<?php

namespace Tests\Feature;

use Tests\TestCase;

class MiddlewareTest extends TestCase
{
    public function test_guests_are_redirected_to_login(): void
    {
        $this->get('/dashboard')->assertRedirect('/login');
        $this->get('/admin/users')->assertRedirect('/login');
    }

    public function test_json_requests_from_guests_get_401(): void
    {
        $this->getJson('/dashboard')->assertUnauthorized();
    }

    public function test_session_with_unknown_role_is_rejected(): void
    {
        $this->withSession(['user' => ['uid' => 'x', 'role' => 'pending']]);

        $this->get('/dashboard')->assertRedirect('/login');
    }

    public function test_approved_member_can_reach_dashboard(): void
    {
        $this->signIn('member');

        $this->get('/dashboard')->assertOk();
    }

    public function test_member_cannot_reach_admin(): void
    {
        $this->signIn('member');

        $this->get('/admin/users')->assertForbidden();
        $this->post('/admin/users/abc/approve')->assertForbidden();
    }

    public function test_admin_can_reach_admin(): void
    {
        $users = $this->signIn('admin');
        $users->shouldReceive('all')->andReturn([]);

        $this->get('/admin/users')->assertOk()->assertSee('No one is waiting.');
    }

    public function test_revoked_user_is_logged_out_on_next_request(): void
    {
        $this->signIn('member', status: 'rejected');

        $this->get('/dashboard')
            ->assertRedirect('/login')
            ->assertSessionHas('error', 'Your access has been revoked.');

        $this->assertFalse(session()->has('user'));
    }

    public function test_deleted_user_doc_logs_out(): void
    {
        $users = $this->mockUsers();
        $users->shouldReceive('access')->andReturnNull();
        $this->signIn('member', users: $users);

        $this->get('/dashboard')->assertRedirect('/login')->assertSessionMissing('error');
    }

    public function test_role_changes_are_picked_up_without_relogin(): void
    {
        $users = $this->mockUsers();
        $users->shouldReceive('access')->andReturn(['status' => 'approved', 'role' => 'admin']);
        $users->shouldReceive('all')->andReturn([]);
        $this->signIn('member', users: $users);

        $this->get('/admin/users')->assertOk();
        $this->assertSame('admin', session('user.role'));
    }
}
