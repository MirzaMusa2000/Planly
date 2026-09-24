// Approved members' names and profile photos, live, for every page:
// $store.people.name(uid) / .photo(uid) / .initial(uid). Also the source of
// $store.planner.members. Photos are small data URLs on users/{uid}.photoUrl
// (see profile.js); Firebase Storage needs a paid plan.
import Alpine from 'alpinejs';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

Alpine.store('people', {
    list: [], // [{ uid, displayName, photoUrl }]
    loaded: false,

    get byId() {
        return Object.fromEntries(this.list.map((p) => [p.uid, p]));
    },

    name(uid) {
        return this.byId[uid]?.displayName ?? '';
    },

    photo(uid) {
        return this.byId[uid]?.photoUrl || '';
    },

    initial(uid) {
        return (this.name(uid) || '?').trim().charAt(0).toUpperCase();
    },
});

let started = false;

/** Start the live list (once), after the signed-in user is known to be approved. */
export function startPeopleFeed() {
    if (started) return;
    started = true;
    const store = Alpine.store('people');

    onSnapshot(query(collection(db, 'users'), where('status', '==', 'approved')), (snapshot) => {
        store.list = snapshot.docs.map((d) => ({
            uid: d.id,
            displayName: d.data().displayName || d.data().email || 'Someone',
            photoUrl: d.data().photoUrl || '',
        }));
        store.loaded = true;
    }, (error) => console.error(error));
}
