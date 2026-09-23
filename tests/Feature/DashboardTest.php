<?php

namespace Tests\Feature;

use Tests\TestCase;

class DashboardTest extends TestCase
{
    public function test_dashboard_has_calendar_lists_and_propose_form(): void
    {
        $this->signIn();

        $this->get('/dashboard')
            ->assertOk()
            ->assertSee('x-data="calendarView"', false)
            ->assertSee('x-ref="calendar"', false)
            ->assertSee('Upcoming events')
            ->assertSee('Open proposals')
            ->assertSee('x-data="proposeModal"', false)
            ->assertSee('Candidate dates')
            ->assertSee('x-data x-show="$store.planner.selected"', false)
            ->assertSee('x-data="dayPanel"', false)
            ->assertSee('Add to itinerary');
    }

    public function test_propose_button_opens_form_in_place_on_dashboard(): void
    {
        $this->signIn();

        $this->get('/dashboard')->assertSee("\$dispatch('propose-event')", false);
    }

    public function test_propose_button_links_to_dashboard_from_other_pages(): void
    {
        $users = $this->signIn('admin');
        $users->shouldReceive('all')->andReturn([]);

        $this->get('/admin/users')->assertSee(route('dashboard').'#propose', false);
    }

    public function test_timezone_is_exposed_to_the_browser(): void
    {
        $this->signIn();

        $this->get('/dashboard')->assertSee('"timezone":"Asia\/Kuala_Lumpur"', false);
    }
}
