// Group chat: floating button + slide-up panel on every authenticated page.
// Listens to the latest 50 messages, loads older pages on demand, and keeps
// users/{uid}.lastReadChatAt up to date for the unread badge.
import Alpine from 'alpinejs';
import {
    addDoc,
    collection,
    doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    startAfter,
    updateDoc,
} from 'firebase/firestore';
import { approvedUser } from './session';
import { notify } from './push';
import { db } from './firebase';
import { addDays, formatShort } from './dates';
import { locale, t } from './i18n';

export const PAGE_SIZE = 50;
export const MAX_LENGTH = 1000;

const TIMEZONE = window.Planly?.timezone || 'Asia/Kuala_Lumpur';
const messagesRef = () => collection(db, 'chats', 'main', 'messages');
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE });
const timeFormat = new Intl.DateTimeFormat(locale, { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });

function toMessage(snap) {
    const d = snap.data({ serverTimestamps: 'estimate' });
    return {
        id: snap.id,
        senderId: d.senderId,
        senderName: d.senderName || 'Someone',
        text: d.text ?? '',
        createdAt: d.createdAt?.toDate?.() ?? new Date(),
        pending: snap.metadata.hasPendingWrites,
    };
}

Alpine.data('chat', () => {
    // Outside reactive state: Firestore snapshots (pagination cursors) + timers.
    const snapshots = new Map();
    let markReadTimer = null;

    return {
        MAX_LENGTH,
        open: false,
        ready: false,
        messages: [], // oldest -> newest
        hasMore: false,
        loadingOlder: false,
        draft: '',
        error: '',
        lastReadAt: null, // Date
        now: Date.now(),

        get me() {
            return window.Planly.user;
        },

        async init() {
            setInterval(() => (this.now = Date.now()), 30_000);

            this.$watch('open', (open) => {
                Alpine.store('overlays').chat = open;
                if (open) {
                    this.$nextTick(() => {
                        this.scrollToBottom();
                        this.$refs.input?.focus();
                    });
                    this.markRead();
                }
            });
            document.addEventListener('visibilitychange', () => this.markRead());

            // "#chat" (e.g. from a notification) opens the chat.
            const openFromLink = () => {
                if (window.location.hash !== '#chat') return;
                history.replaceState(null, '', window.location.pathname + window.location.search);
                this.open = true;
            };
            window.addEventListener('hashchange', openFromLink);
            openFromLink();

            const user = await approvedUser();
            if (!user) return;

            // My read receipt. Before the first read, count from when I joined.
            onSnapshot(doc(db, 'users', user.uid), (snap) => {
                const d = snap.data({ serverTimestamps: 'estimate' }) ?? {};
                this.lastReadAt = (d.lastReadChatAt ?? d.approvedAt ?? d.createdAt)?.toDate?.() ?? null;
            });

            onSnapshot(
                query(messagesRef(), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)),
                (snapshot) => this.applyLive(snapshot),
                (error) => {
                    console.error(error);
                    this.error = t('Chat is unavailable right now.');
                },
            );
        },

        /** Merge the live window of the newest messages into what we've loaded. */
        applyLive(snapshot) {
            const byId = new Map(this.messages.map((m) => [m.id, m]));
            const live = snapshot.docs.map((s) => {
                snapshots.set(s.id, s);
                return toMessage(s);
            });
            live.forEach((m) => byId.set(m.id, m));

            // "removed" fires both for deletions and for messages that simply
            // slid out of the 50-message window; only drop real deletions.
            const oldestLive = live.length ? live[live.length - 1].createdAt : null;
            for (const change of snapshot.docChanges()) {
                if (change.type !== 'removed') continue;
                const m = byId.get(change.doc.id);
                if (m && (!oldestLive || m.createdAt >= oldestLive)) byId.delete(change.doc.id);
            }

            if (!this.ready) this.hasMore = live.length === PAGE_SIZE;

            const stickToBottom = !this.ready || this.isNearBottom();
            this.messages = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
            this.ready = true;

            if (this.open) {
                if (stickToBottom) this.$nextTick(() => this.scrollToBottom());
                this.markRead();
            }
        },

        async loadOlder() {
            if (this.loadingOlder || !this.hasMore || !this.messages.length) return;
            const cursor = snapshots.get(this.messages[0].id);
            if (!cursor) return;

            this.loadingOlder = true;
            const scroller = this.$refs.scroller;
            const previousHeight = scroller.scrollHeight;

            try {
                const snap = await getDocs(query(messagesRef(), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)));
                const known = new Set(this.messages.map((m) => m.id));
                const older = snap.docs.map((s) => {
                    snapshots.set(s.id, s);
                    return toMessage(s);
                }).filter((m) => !known.has(m.id));

                this.messages = [...older, ...this.messages].sort((a, b) => a.createdAt - b.createdAt);
                this.hasMore = snap.docs.length === PAGE_SIZE;

                // Keep the message you were looking at in place.
                this.$nextTick(() => {
                    scroller.scrollTop += scroller.scrollHeight - previousHeight;
                });
            } catch (e) {
                console.error(e);
                Alpine.store('toast').show(t('Couldn’t load older messages.'), 'error');
            } finally {
                this.loadingOlder = false;
            }
        },

        // --- Sending ------------------------------------------------------------

        get remaining() {
            return MAX_LENGTH - this.draft.length;
        },

        get canSend() {
            return this.draft.trim().length > 0 && this.draft.length <= MAX_LENGTH;
        },

        onEnter(event) {
            // Enter sends; Shift+Enter (or an IME composition) inserts a newline.
            if (event.shiftKey || event.isComposing) return;
            event.preventDefault();
            this.send();
        },

        async send() {
            if (!this.canSend) return;
            const text = this.draft.trim();
            const draft = this.draft;
            this.draft = '';
            this.error = '';
            this.$nextTick(() => {
                this.autosize();
                this.scrollToBottom();
            });

            try {
                // The live listener shows the message immediately (pending);
                // awaiting only surfaces a rejected write.
                const ref = await addDoc(messagesRef(), {
                    senderId: this.me.uid,
                    senderName: (this.me.displayName || '').slice(0, 60),
                    text,
                    createdAt: serverTimestamp(),
                });
                notify('chat', { messageId: ref.id });
            } catch (e) {
                console.error(e);
                this.draft = draft;
                this.error = e?.code === 'permission-denied'
                    ? t('Message not sent: you may need to sign in again.')
                    : t('Message not sent. Check your connection and try again.');
            }
        },

        // --- Unread -------------------------------------------------------------

        get unreadCount() {
            if (!this.lastReadAt) return 0;
            return this.messages.filter((m) => m.senderId !== this.me.uid && m.createdAt > this.lastReadAt).length;
        },

        get unreadLabel() {
            const n = this.unreadCount;
            return n >= PAGE_SIZE ? `${PAGE_SIZE}+` : String(n);
        },

        /** Debounced: record that I've read up to now, while the panel is visible. */
        markRead() {
            clearTimeout(markReadTimer);
            markReadTimer = setTimeout(async () => {
                const newest = this.messages[this.messages.length - 1];
                if (!this.open || document.visibilityState !== 'visible' || !newest) return;
                if (this.lastReadAt && newest.createdAt <= this.lastReadAt) return;
                try {
                    await updateDoc(doc(db, 'users', this.me.uid), { lastReadChatAt: serverTimestamp() });
                } catch (e) {
                    console.error(e);
                }
            }, 600);
        },

        // --- Display helpers ----------------------------------------------------

        isMine(m) {
            return m.senderId === this.me.uid;
        },

        dayKey(date) {
            return dayKeyFormat.format(date);
        },

        dayLabel(date) {
            const key = this.dayKey(date);
            const today = this.dayKey(new Date(this.now));
            if (key === today) return t('Today');
            if (key === addDays(today, -1)) return t('Yesterday');
            return formatShort(key);
        },

        /** Show a day divider before the first message of each day. */
        startsDay(index) {
            return index === 0 || this.dayKey(this.messages[index - 1].createdAt) !== this.dayKey(this.messages[index].createdAt);
        },

        /** Start a new bubble group (name shown) on sender change, new day or a 5-minute gap. */
        startsGroup(index) {
            if (this.startsDay(index)) return true;
            const prev = this.messages[index - 1];
            const m = this.messages[index];
            return prev.senderId !== m.senderId || m.createdAt - prev.createdAt > 5 * 60_000;
        },

        relativeTime(date) {
            const seconds = (this.now - date.getTime()) / 1000;
            if (seconds < 60) return t('just now');
            if (seconds < 3600) return t('{n}m ago', { n: Math.floor(seconds / 60) });
            const time = timeFormat.format(date);
            const label = this.dayLabel(date);
            return label === t('Today') ? time : `${label}, ${time}`;
        },

        // --- Scrolling / sizing -------------------------------------------------

        isNearBottom() {
            const el = this.$refs.scroller;
            return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        },

        scrollToBottom() {
            const el = this.$refs.scroller;
            if (el) el.scrollTop = el.scrollHeight;
        },

        autosize() {
            const el = this.$refs.input;
            if (!el) return;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
        },

        toggle() {
            this.open = !this.open;
        },

        close() {
            this.open = false;
        },
    };
});
