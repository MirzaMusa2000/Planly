// Members (admin): live list of users grouped by status, with approve /
// reject / revoke. firestore.rules only allow admins to change another user's
// status or role, and never their own.
import Alpine from 'alpinejs';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { approvedUser } from './session';
import { db } from './firebase';
import { confirmDialog } from './ui';

const TIMEZONE = window.Planly?.timezone || 'Asia/Kuala_Lumpur';
const joinedFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'short', year: 'numeric' });

// Pastel avatars, picked per user so colours stay stable.
const AVATARS = [
    'bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700',
];

function relative(date) {
    const days = Math.round((Date.now() - date.getTime()) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return joinedFormat.format(date);
}

Alpine.data('membersPage', () => ({
    users: [],
    loading: true,
    error: '',
    busy: {},

    get me() {
        return window.Planly.user?.uid;
    },

    async init() {
        await approvedUser();
        onSnapshot(collection(db, 'users'), (snap) => {
            this.users = snap.docs
                .map((d) => {
                    const data = d.data({ serverTimestamps: 'estimate' });
                    return {
                        uid: d.id,
                        email: data.email ?? '',
                        displayName: data.displayName ?? '',
                        role: data.role ?? 'member',
                        status: data.status ?? 'pending',
                        createdAt: data.createdAt?.toDate?.() ?? null,
                        approvedAt: data.approvedAt?.toDate?.() ?? null,
                    };
                })
                .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
            this.loading = false;
        }, (e) => {
            console.error(e);
            this.error = 'Couldn’t load members. Check your connection and refresh.';
            this.loading = false;
        });
    },

    get sections() {
        const by = (status) => this.users.filter((u) => u.status === status);
        return [
            { key: 'pending', title: 'Waiting for approval', users: by('pending'), empty: 'No one is waiting.', chip: 'bg-amber-100 text-amber-700' },
            { key: 'approved', title: 'Members', users: by('approved'), empty: 'No approved members yet.', chip: 'bg-emerald-100 text-emerald-700' },
            { key: 'rejected', title: 'Rejected or revoked', users: by('rejected'), empty: 'Nobody here.', chip: 'bg-slate-200 text-slate-600' },
        ];
    },

    initial(user) {
        return (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
    },

    avatarColour(uid) {
        let hash = 0;
        for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
        return AVATARS[hash % AVATARS.length];
    },

    joinedLine(user, section) {
        const parts = [];
        if (user.createdAt) parts.push(`Joined ${joinedFormat.format(user.createdAt)}`);
        if (section === 'approved' && user.approvedAt) parts.push(`Approved ${relative(user.approvedAt)}`);
        return parts.join(' · ');
    },

    label(user) {
        return user.displayName || user.email;
    },

    async setStatus(user, changes, message) {
        this.busy = { ...this.busy, [user.uid]: true };
        try {
            await updateDoc(doc(db, 'users', user.uid), changes);
            Alpine.store('toast').show(message);
        } catch (e) {
            console.error(e);
            Alpine.store('toast').show(e?.code === 'permission-denied' ? 'Only admins can do that.' : 'That didn’t work. Please try again.', 'error');
        } finally {
            const { [user.uid]: _, ...rest } = this.busy;
            this.busy = rest;
        }
    },

    approve(user) {
        return this.setStatus(user, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: this.me,
        }, `Approved ${this.label(user)}.`);
    },

    reject(user) {
        return this.setStatus(user, { status: 'rejected' }, `Rejected ${this.label(user)}.`);
    },

    revoke(user) {
        return confirmDialog({
            title: 'Revoke access?',
            message: 'They’ll be signed out of Planly right away. You can approve them again later.',
            detail: this.label(user),
            detailSub: user.displayName && user.email ? user.email : '',
            confirmLabel: 'Revoke access',
            tone: 'danger',
            icon: 'user-x',
            action: () => this.setStatus(user, { status: 'rejected' }, `Revoked access for ${this.label(user)}.`),
        });
    },
}));

// Home hero: "Good afternoon, ☀️ / Mirza / Wed, 23 Sep 2026" in the app timezone.
Alpine.data('greeting', () => {
    const now = new Date();
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: 'numeric', hourCycle: 'h23' }).format(now));
    const [salutation, emoji] = hour < 12 ? ['Good morning', '☀️'] : hour < 18 ? ['Good afternoon', '🌤️'] : ['Good evening', '🌙'];
    return {
        salutation,
        emoji,
        today: new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now),
        get firstName() {
            return (window.Planly.user?.displayName || '').split(' ')[0] || 'there';
        },
    };
});
