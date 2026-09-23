<?php

namespace Tests\Feature;

use Tests\TestCase;

class ChatLayoutTest extends TestCase
{
    public function test_chat_is_on_the_dashboard(): void
    {
        $this->signIn();

        $this->get('/dashboard')
            ->assertOk()
            ->assertSee('x-data="chat"', false)
            ->assertSee('id="chat-panel"', false)
            ->assertSee('Message the group…');
    }

    public function test_chat_is_on_other_authenticated_pages(): void
    {
        $users = $this->signIn('admin');
        $users->shouldReceive('all')->andReturn([]);

        $this->get('/admin/users')->assertOk()->assertSee('x-data="chat"', false);
    }

    public function test_chat_is_not_on_guest_pages(): void
    {
        $this->get('/login')->assertOk()->assertDontSee('x-data="chat"', false);
    }
}
