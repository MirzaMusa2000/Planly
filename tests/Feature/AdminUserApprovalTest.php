<?php

namespace Tests\Feature;

use Tests\TestCase;

class AdminUserApprovalTest extends TestCase
{
    public function test_users_are_listed_by_status(): void
    {
        $users = $this->signIn('admin', 'admin1');
        $users->shouldReceive('all')->andReturn([
            $this->userRecord(['uid' => 'p1', 'displayName' => 'Pending Pat', 'status' => 'pending']),
            $this->userRecord(['uid' => 'a1', 'displayName' => 'Approved Ann']),
            $this->userRecord(['uid' => 'r1', 'displayName' => 'Rejected Rob', 'status' => 'rejected']),
        ]);

        $this->get('/admin/users')
            ->assertOk()
            ->assertSeeInOrder(['Waiting for approval', 'Pending Pat', 'Members', 'Approved Ann', 'Rejected or revoked', 'Rejected Rob']);
    }

    public function test_approve_sets_claims_then_status(): void
    {
        $users = $this->signIn('admin', 'admin1');
        $users->shouldReceive('find')->with('p1')->andReturn($this->userRecord(['uid' => 'p1', 'status' => 'pending']));
        $users->shouldReceive('approve')->once()->with('p1', 'admin1');
        $this->mockAuth()->shouldReceive('setClaims')->once()->with('p1', true, false);

        $this->from('/admin/users')->post('/admin/users/p1/approve')
            ->assertRedirect('/admin/users')
            ->assertSessionHas('status', 'Approved Ali.');
    }

    public function test_approving_an_admin_includes_admin_claim(): void
    {
        $users = $this->signIn('admin', 'admin1');
        $users->shouldReceive('find')->andReturn($this->userRecord(['uid' => 'r1', 'status' => 'rejected', 'role' => 'admin']));
        $users->shouldReceive('approve')->once();
        $this->mockAuth()->shouldReceive('setClaims')->once()->with('r1', true, true);

        $this->post('/admin/users/r1/approve')->assertRedirect();
    }

    public function test_reject_removes_claims_and_revokes_tokens(): void
    {
        $users = $this->signIn('admin', 'admin1');
        $users->shouldReceive('find')->andReturn($this->userRecord(['uid' => 'p1', 'status' => 'pending']));
        $users->shouldReceive('reject')->once()->with('p1');
        $auth = $this->mockAuth();
        $auth->shouldReceive('setClaims')->once()->with('p1', false);
        $auth->shouldReceive('revokeSessions')->once()->with('p1');

        $this->post('/admin/users/p1/reject')->assertSessionHas('status', 'Rejected Ali.');
    }

    public function test_revoke_removes_claims_and_revokes_tokens(): void
    {
        $users = $this->signIn('admin', 'admin1');
        $users->shouldReceive('find')->andReturn($this->userRecord(['uid' => 'a1']));
        $users->shouldReceive('reject')->once()->with('a1');
        $auth = $this->mockAuth();
        $auth->shouldReceive('setClaims')->once()->with('a1', false);
        $auth->shouldReceive('revokeSessions')->once()->with('a1');

        $this->post('/admin/users/a1/revoke')->assertSessionHas('status', 'Revoked access for Ali.');
    }

    public function test_admin_cannot_change_own_access(): void
    {
        $users = $this->signIn('admin', 'admin1');
        $users->shouldNotReceive('reject');
        $this->mockAuth()->shouldNotReceive('setClaims');

        $this->post('/admin/users/admin1/revoke')->assertStatus(422);
    }

    public function test_unknown_user_is_404(): void
    {
        $users = $this->signIn('admin', 'admin1');
        $users->shouldReceive('find')->andReturnNull();

        $this->post('/admin/users/nobody/approve')->assertNotFound();
    }

    public function test_invalid_uid_does_not_match_route(): void
    {
        $this->signIn('admin', 'admin1');

        $this->post('/admin/users/bad.uid/approve')->assertNotFound();
    }
}
