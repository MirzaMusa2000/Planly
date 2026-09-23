<?php

namespace App\Http\Controllers;

use App\Exceptions\EventStateException;
use App\Services\FirestoreEventService;
use App\Services\FirestoreUserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Confirm / cancel go through the server (not the browser) so permissions
 * are checked here: only the admin or the event's proposer may do them.
 */
class EventController extends Controller
{
    public function __construct(private FirestoreEventService $events) {}

    public function confirm(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
        ]);

        $this->authorizeManage($request, $id);

        try {
            $event = $this->events->confirm($id, $data['date']);
        } catch (EventStateException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => "Confirmed “{$event['title']}”.",
            'event' => ['id' => $id, 'status' => $event['status'], 'finalDate' => $event['finalDate']],
        ]);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $this->authorizeManage($request, $id);

        try {
            $event = $this->events->cancel($id);
        } catch (EventStateException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => "Cancelled “{$event['title']}”.",
            'event' => ['id' => $id, 'status' => $event['status']],
        ]);
    }

    /** 404 if the event is missing, 403 unless the actor is the admin or the proposer. */
    private function authorizeManage(Request $request, string $id): void
    {
        $event = $this->events->find($id);
        abort_if($event === null, 404, 'Event not found.');

        $user = $request->session()->get('user');
        $allowed = ($user['role'] ?? null) === FirestoreUserService::ROLE_ADMIN
            || ($event['proposedBy'] !== null && $event['proposedBy'] === ($user['uid'] ?? null));

        abort_unless($allowed, 403, 'Only the admin or the person who proposed this event can do that.');
    }
}
