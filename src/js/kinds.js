// Event kinds: an emoji and a colour per kind of plan, chosen when proposing
// (and changeable later by the proposer or the admin). Older events without a
// kind get one guessed from their title. firestore.rules lists the same ids.
import Alpine from 'alpinejs';
import { N_, t } from './i18n';

export const KINDS = [
    { id: 'beach', emoji: '🏖️', label: N_('Beach'), chip: 'bg-sky-100 text-sky-700', ink: 'bg-sky-400/20' },
    { id: 'food', emoji: '🍽️', label: N_('Food'), chip: 'bg-amber-100 text-amber-700', ink: 'bg-amber-300/20' },
    { id: 'hike', emoji: '⛰️', label: N_('Outdoors'), chip: 'bg-emerald-100 text-emerald-700', ink: 'bg-emerald-400/20' },
    { id: 'birthday', emoji: '🎂', label: N_('Birthday'), chip: 'bg-rose-100 text-rose-700', ink: 'bg-rose-400/20' },
    { id: 'trip', emoji: '✈️', label: N_('Trip'), chip: 'bg-brand-100 text-brand-700', ink: 'bg-brand-400/25' },
    { id: 'party', emoji: '🎉', label: N_('Party'), chip: 'bg-violet-100 text-violet-700', ink: 'bg-violet-400/20' },
    { id: 'sport', emoji: '⚽', label: N_('Sport'), chip: 'bg-orange-100 text-orange-700', ink: 'bg-orange-400/20' },
    { id: 'other', emoji: '📅', label: N_('Other'), chip: 'bg-slate-100 text-slate-600', ink: 'bg-white/10' },
];

const BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]));

// Words in a title that give its kind away (English and Malay), first match wins.
const GUESSES = [
    ['birthday', /birthday|hari ?jadi|besday|bday/i],
    ['beach', /beach|pantai|pulau|island|snorkel|port dickson|langkawi|redang|tioman/i],
    ['hike', /hik(e|ing)|bukit|gunung|mountain|camp(ing)?|air terjun|waterfall|trek|glamping/i],
    ['sport', /futsal|football|bola|badminton|gym|run(ning)?|marathon|sukan|sport|bowling|swim|renang/i],
    ['party', /party|parti|kenduri|majlis|raya|open house|karaoke/i],
    ['food', /makan|dinner|lunch|breakfast|brunch|sarapan|bbq|steamboat|cafe|kopi|coffee|buffet|iftar|sahur/i],
    ['trip', /trip|travel|holiday|percutian|cuti|vacation|road ?trip|bercuti/i],
];

export function guessKind(title = '') {
    return GUESSES.find(([, pattern]) => pattern.test(title))?.[0] ?? 'other';
}

/** The kind of an event: its own, or guessed from the title. */
export const kindOf = (event) => BY_ID[event?.kind] ?? BY_ID[guessKind(event?.title)];

export const kindLabel = (kind) => t(kind.label);

export const isKind = (id) => id in BY_ID;

// In templates: $kind(event).emoji / .chip / .ink, $kinds (the list), $kindLabel(kind).
Alpine.magic('kind', () => kindOf);
Alpine.magic('kinds', () => KINDS);
Alpine.magic('kindLabel', () => kindLabel);
