<?php

namespace Tests\Feature;

use App\Exceptions\EventStateException;
use App\Services\FirestoreEventService;
use Mockery\MockInterface;
use Tests\TestCase;

class EventControllerTest extends TestCase
{
    private function event(array $overrides = []): array
    {
        return array_merge([
            'id' => 'evt1',
            'title' => 'Beach day',
            'status' => 'proposed',
            'proposedBy' => 'proposer1',
            'candidateDates' => ['2026-10-10', '2026-10-11'],
            'finalDate' => null,
        ], $overrides);
    }

    private function mockEvents(?array $event = null): MockInterface
    {
        $mock = $this->mock(FirestoreEventService::class);
        $mock->shouldReceive('find')->with('evt1')->andReturn($event ?? $this->event())->byDefault();

        return $mock;
    }

    public function test_admin_can_confirm_a_candidate_date(): void
    {
        $this->signIn('admin', 'admin1');
        $this->mockEvents()->shouldReceive('confirm')->once()->with('evt1', '2026-10-10')
            ->andReturn($this->event(['status' => 'confirmed', 'finalDate' => '2026-10-10']));

        $this->postJson('/events/evt1/confirm', ['date' => '2026-10-10'])
            ->assertOk()
            ->assertJson(['event' => ['status' => 'confirmed', 'finalDate' => '2026-10-10']]);
    }

    public function test_proposer_can_confirm(): void
    {
        $this->signIn('member', 'proposer1');
        $this->mockEvents()->shouldReceive('confirm')->once()
            ->andReturn($this->event(['status' => 'confirmed', 'finalDate' => '2026-10-11']));

        $this->postJson('/events/evt1/confirm', ['date' => '2026-10-11'])->assertOk();
    }

    public function test_other_members_cannot_confirm_or_cancel(): void
    {
        $this->signIn('member', 'someone-else');
        $events = $this->mockEvents();
        $events->shouldNotReceive('confirm');
        $events->shouldNotReceive('cancel');

        $this->postJson('/events/evt1/confirm', ['date' => '2026-10-10'])->assertForbidden();
        $this->postJson('/events/evt1/cancel')->assertForbidden();
    }

    public function test_confirm_requires_a_valid_date(): void
    {
        $this->signIn('admin', 'admin1');
        $this->mockEvents()->shouldNotReceive('confirm');

        $this->postJson('/events/evt1/confirm', [])->assertUnprocessable()->assertJsonValidationErrors('date');
        $this->postJson('/events/evt1/confirm', ['date' => '10/10/2026'])->assertUnprocessable();
    }

    public function test_state_conflicts_return_409(): void
    {
        $this->signIn('admin', 'admin1');
        $this->mockEvents()->shouldReceive('confirm')
            ->andThrow(new EventStateException('This event is already confirmed.'));

        $this->postJson('/events/evt1/confirm', ['date' => '2026-10-10'])
            ->assertStatus(409)
            ->assertJson(['message' => 'This event is already confirmed.']);
    }

    public function test_unknown_event_is_404(): void
    {
        $this->signIn('admin', 'admin1');
        $this->mock(FirestoreEventService::class)->shouldReceive('find')->andReturnNull();

        $this->postJson('/events/nope/cancel')->assertNotFound();
    }

    public function test_proposer_can_cancel(): void
    {
        $this->signIn('member', 'proposer1');
        $this->mockEvents()->shouldReceive('cancel')->once()->with('evt1')
            ->andReturn($this->event(['status' => 'cancelled']));

        $this->postJson('/events/evt1/cancel')
            ->assertOk()
            ->assertJson(['event' => ['status' => 'cancelled']]);
    }

    public function test_guests_get_401(): void
    {
        $this->mock(FirestoreEventService::class)->shouldNotReceive('find');

        $this->postJson('/events/evt1/confirm', ['date' => '2026-10-10'])->assertUnauthorized();
    }

    public function test_invalid_event_id_does_not_match_route(): void
    {
        $this->signIn('admin', 'admin1');

        $this->postJson('/events/bad.id/cancel')->assertNotFound();
    }
}
