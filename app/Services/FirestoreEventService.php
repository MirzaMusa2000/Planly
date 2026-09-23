<?php

namespace App\Services;

use App\Exceptions\EventStateException;
use Google\Cloud\Firestore\CollectionReference;
use Google\Cloud\Firestore\DocumentSnapshot;
use Google\Cloud\Firestore\Transaction;
use Kreait\Firebase\Contract\Firestore;

/**
 * Server-side event writes (confirm / cancel). The Admin SDK bypasses
 * Firestore rules, so callers must check the actor's permission first.
 */
class FirestoreEventService
{
    public const PROPOSED = 'proposed';
    public const CONFIRMED = 'confirmed';
    public const CANCELLED = 'cancelled';

    public function __construct(private Firestore $firestore) {}

    /**
     * @return array{id: string, title: string, status: string, proposedBy: ?string, candidateDates: list<string>, finalDate: ?string}|null
     */
    public function find(string $id): ?array
    {
        $snapshot = $this->events()->document($id)->snapshot();

        return $snapshot->exists() ? $this->hydrate($snapshot) : null;
    }

    /**
     * Confirm a proposed event on one of its candidate dates.
     * Runs in a transaction so two people confirming at once can't both win.
     *
     * @throws EventStateException
     */
    public function confirm(string $id, string $date): array
    {
        return $this->firestore->database()->runTransaction(function (Transaction $tx) use ($id, $date) {
            $ref = $this->events()->document($id);
            $event = $this->hydrateOrFail($tx->snapshot($ref));

            if ($event['status'] !== self::PROPOSED) {
                throw new EventStateException($event['status'] === self::CONFIRMED
                    ? 'This event is already confirmed.'
                    : 'This event was cancelled.');
            }

            if (! in_array($date, $event['candidateDates'], true)) {
                throw new EventStateException('That date is not one of the candidate dates.');
            }

            $tx->update($ref, [
                ['path' => 'status', 'value' => self::CONFIRMED],
                ['path' => 'finalDate', 'value' => $date],
            ]);

            return ['status' => self::CONFIRMED, 'finalDate' => $date] + $event;
        });
    }

    /**
     * Cancel a proposed or confirmed event (hides it from the calendar).
     *
     * @throws EventStateException
     */
    public function cancel(string $id): array
    {
        return $this->firestore->database()->runTransaction(function (Transaction $tx) use ($id) {
            $ref = $this->events()->document($id);
            $event = $this->hydrateOrFail($tx->snapshot($ref));

            if ($event['status'] === self::CANCELLED) {
                throw new EventStateException('This event is already cancelled.');
            }

            $tx->update($ref, [['path' => 'status', 'value' => self::CANCELLED]]);

            return ['status' => self::CANCELLED] + $event;
        });
    }

    private function hydrateOrFail(DocumentSnapshot $snapshot): array
    {
        if (! $snapshot->exists()) {
            throw new EventStateException('This event no longer exists.');
        }

        return $this->hydrate($snapshot);
    }

    private function hydrate(DocumentSnapshot $snapshot): array
    {
        $d = $snapshot->data();

        return [
            'id' => $snapshot->id(),
            'title' => (string) ($d['title'] ?? ''),
            'status' => (string) ($d['status'] ?? ''),
            'proposedBy' => $d['proposedBy'] ?? null,
            'candidateDates' => array_values($d['candidateDates'] ?? []),
            'finalDate' => $d['finalDate'] ?? null,
        ];
    }

    private function events(): CollectionReference
    {
        return $this->firestore->database()->collection('events');
    }
}
