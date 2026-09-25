// Data retention: the push worker's daily cleanup (workers/push, 03:00) deletes
// a document once its `expireAt` has passed. Users are never deleted.
//
//  - chat messages: 3 months after they're sent
//  - an event and everything under it (votes, itinerary, checklist,
//    expenses, payments): 3 months after the event's last day, so plans
//    made far ahead don't vanish before they happen
//
// firestore.rules re-checks these values (same 90 days, same UTC midnight).
import { Timestamp } from 'firebase/firestore';

export const RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** RETENTION_DAYS after a YYYY-MM-DD day (UTC midnight, like the rules). */
export function expiryAfterDay(dateString) {
    const [y, m, d] = dateString.split('-').map(Number);
    return Timestamp.fromMillis(Date.UTC(y, m - 1, d) + RETENTION_DAYS * DAY_MS);
}

/** RETENTION_DAYS from now (chat messages). */
export const expiryFromNow = () => Timestamp.fromMillis(Date.now() + RETENTION_DAYS * DAY_MS);

/** `{ expireAt }` to copy an event's expiry onto something stored under it. */
export function sameExpiryAs(event) {
    return event?.expireAt ? { expireAt: event.expireAt } : {};
}
