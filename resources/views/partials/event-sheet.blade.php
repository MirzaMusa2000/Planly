{{-- Event details: bottom sheet on mobile, right-hand drawer on desktop. Phase 3 adds voting/RSVP. --}}
<div x-data x-show="$store.planner.selected" x-cloak class="fixed inset-0 z-50"
     @keydown.escape.window="$store.planner.close()">
    <div class="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" x-show="$store.planner.selected" x-transition.opacity
         @click="$store.planner.close()"></div>

    <div x-show="$store.planner.selected" x-trap.noscroll.inert="$store.planner.selected"
         x-transition:enter="transition duration-200 ease-out" x-transition:enter-start="translate-y-8 opacity-0 sm:translate-x-8 sm:translate-y-0"
         x-transition:leave="transition duration-150 ease-in" x-transition:leave-end="translate-y-8 opacity-0 sm:translate-x-8 sm:translate-y-0"
         role="dialog" aria-modal="true" aria-labelledby="event-sheet-title"
         class="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl bg-ink-900 text-white shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-3xl">

        <template x-if="$store.planner.selected">
            <div x-data="{ get e() { return $store.planner.selected } }" class="flex min-h-0 flex-1 flex-col">
                <div class="flex items-center justify-between px-5 pt-4">
                    <button type="button" @click="$store.planner.close()" class="grid h-9 w-9 place-items-center rounded-xl text-slate-300 hover:bg-white/10" aria-label="Close">
                        <x-icon name="x"/>
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto px-5 pb-6">
                    {{-- Title --}}
                    <div class="flex items-start gap-3 pt-2">
                        <span class="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                              :class="e.status === 'confirmed' ? 'bg-emerald-400 text-ink-950' : 'bg-amber-300 text-ink-950'">
                            <x-icon name="check" class="h-5 w-5" x-show="e.status === 'confirmed'"/>
                            <x-icon name="calendar" class="h-5 w-5" x-show="e.status !== 'confirmed'"/>
                        </span>
                        <div class="min-w-0">
                            <h2 id="event-sheet-title" class="text-xl leading-tight font-bold break-words" x-text="e.title"></h2>
                            <span class="chip mt-2" :class="e.status === 'confirmed' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-300/15 text-amber-200'"
                                  x-text="e.status === 'confirmed' ? 'Confirmed' : 'Proposed'"></span>
                        </div>
                    </div>

                    {{-- Facts --}}
                    <dl class="mt-6 space-y-3 rounded-2xl bg-ink-800/70 p-4 text-sm">
                        <div class="flex items-center gap-3" x-show="e.status === 'confirmed'">
                            <dt><x-icon name="calendar" class="h-[18px] w-[18px] text-slate-400"/><span class="sr-only">Date</span></dt>
                            <dd class="font-semibold" x-text="$dates.long(e.finalDate)"></dd>
                        </div>
                        <div class="flex items-center gap-3" x-show="e.status !== 'confirmed'">
                            <dt><x-icon name="calendar" class="h-[18px] w-[18px] text-slate-400"/><span class="sr-only">Dates</span></dt>
                            <dd x-text="e.candidateDates.length + (e.candidateDates.length === 1 ? ' candidate date' : ' candidate dates')"></dd>
                        </div>
                        <div class="flex items-center gap-3" x-show="e.location">
                            <dt><x-icon name="map-pin" class="h-[18px] w-[18px] text-slate-400"/><span class="sr-only">Location</span></dt>
                            <dd class="break-words" x-text="e.location"></dd>
                        </div>
                        <div class="flex items-center gap-3">
                            <dt><x-icon name="user" class="h-[18px] w-[18px] text-slate-400"/><span class="sr-only">Proposed by</span></dt>
                            <dd>Proposed by <span class="font-semibold" x-text="e.proposedByName || 'someone'"></span></dd>
                        </div>
                    </dl>

                    {{-- Description --}}
                    <section class="mt-5" x-show="e.description">
                        <h3 class="text-sm font-semibold text-slate-300">Description</h3>
                        <p class="mt-1.5 text-sm whitespace-pre-line text-slate-200 break-words" x-text="e.description"></p>
                    </section>

                    {{-- Candidate dates (proposed) --}}
                    <section class="mt-6" x-show="e.status === 'proposed'">
                        <h3 class="text-sm font-semibold text-slate-300">Candidate dates</h3>
                        <ul class="mt-2 space-y-2">
                            <template x-for="date in e.candidateDates" :key="date">
                                <li class="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
                                    :class="$store.planner.everyoneFree(e, date) ? 'bg-amber-300/15 ring-1 ring-amber-300/40' : 'bg-ink-800'">
                                    <span class="font-medium" x-text="$dates.short(date)"></span>
                                    <span class="text-xs font-semibold"
                                          :class="$store.planner.everyoneFree(e, date) ? 'text-amber-200' : 'text-slate-400'"
                                          x-text="$store.planner.everyoneFree(e, date)
                                                ? 'Everyone free ⭐'
                                                : $store.planner.availableCount(e, date) + '/' + $store.planner.approvedCount + ' free'"></span>
                                </li>
                            </template>
                        </ul>
                    </section>

                    {{-- RSVP counts (confirmed) --}}
                    <section class="mt-6" x-show="e.status === 'confirmed'">
                        <h3 class="text-sm font-semibold text-slate-300">Who's coming</h3>
                        <div class="mt-2 grid grid-cols-2 gap-2 text-center">
                            <div class="rounded-2xl bg-emerald-400/10 px-3 py-3">
                                <p class="text-2xl font-bold text-emerald-300" x-text="e.rsvpSummary.join"></p>
                                <p class="text-xs text-slate-400">Joining</p>
                            </div>
                            <div class="rounded-2xl bg-ink-800 px-3 py-3">
                                <p class="text-2xl font-bold text-slate-200" x-text="e.rsvpSummary.notAvailable"></p>
                                <p class="text-xs text-slate-400">Not available</p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </template>
    </div>
</div>
