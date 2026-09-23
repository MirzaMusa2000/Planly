{{-- Propose event: dark sheet (bottom sheet on mobile, dialog on desktop). --}}
<div x-data="proposeModal" x-show="open" x-cloak class="fixed inset-0 z-[60]" @keydown.escape.window="open && close()">
    <div class="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" x-show="open" x-transition.opacity @click="close()"></div>

    <div x-show="open" x-trap.noscroll.inert="open"
         x-transition:enter="transition duration-200 ease-out" x-transition:enter-start="translate-y-8 opacity-0 sm:translate-y-2"
         x-transition:leave="transition duration-150 ease-in" x-transition:leave-end="translate-y-8 opacity-0 sm:translate-y-2"
         role="dialog" aria-modal="true" aria-labelledby="propose-title"
         class="absolute inset-x-0 bottom-0 flex max-h-[94dvh] flex-col rounded-t-3xl bg-ink-900 text-white shadow-2xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">

        <div class="flex items-center gap-3 border-b border-white/10 px-5 py-4">
            <button type="button" @click="close()" class="grid h-9 w-9 place-items-center rounded-xl text-slate-300 hover:bg-white/10" aria-label="Close">
                <x-icon name="x"/>
            </button>
            <h2 id="propose-title" class="text-lg font-bold">Propose event</h2>
        </div>

        <form @submit.prevent="submit" class="flex min-h-0 flex-1 flex-col" novalidate>
            <div class="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                <div>
                    <label for="propose-title-input" class="label text-slate-200">Title <span class="text-rose-400">*</span></label>
                    <input id="propose-title-input" type="text" x-model="title" :maxlength="LIMITS.title" required
                           placeholder="Beach day, dinner, road trip…" class="input-dark">
                </div>

                <div>
                    <label for="propose-location" class="label text-slate-200">Location</label>
                    <div class="relative">
                        <x-icon name="map-pin" class="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-slate-500"/>
                        <input id="propose-location" type="text" x-model="location" :maxlength="LIMITS.location"
                               placeholder="Where?" class="input-dark pl-11">
                    </div>
                </div>

                {{-- Multi-date picker --}}
                <fieldset>
                    <legend class="label text-slate-200">
                        Candidate dates <span class="text-rose-400">*</span>
                        <span class="ml-1 font-normal text-slate-400">Tap every date that could work</span>
                    </legend>

                    <div class="rounded-2xl border border-ink-700 bg-ink-800 p-3">
                        <div class="mb-2 flex items-center justify-between">
                            <button type="button" @click="shiftMonth(-1)" :disabled="!canGoBack"
                                    class="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-30" aria-label="Previous month">
                                <x-icon name="chevron-left" class="h-4 w-4"/>
                            </button>
                            <p class="text-sm font-semibold" x-text="monthLabel" aria-live="polite"></p>
                            <button type="button" @click="shiftMonth(1)"
                                    class="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10" aria-label="Next month">
                                <x-icon name="chevron-right" class="h-4 w-4"/>
                            </button>
                        </div>

                        <div class="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-500">
                            @foreach (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as $weekday)
                                <span class="py-1">{{ $weekday }}</span>
                            @endforeach
                        </div>

                        <div class="grid grid-cols-7 gap-1">
                            <template x-for="(date, i) in days" :key="cursor.year + '-' + cursor.month + '-' + i">
                                <div class="aspect-square max-h-11 justify-self-center w-full">
                                    <button type="button" x-show="date" @click="toggle(date)" :disabled="date && isPast(date)"
                                            :aria-pressed="date && isSelected(date)"
                                            :aria-label="date ? formatShort(date) : ''"
                                            :class="{
                                                'bg-brand-500 text-white font-bold shadow-lift': date && isSelected(date),
                                                'text-slate-600 cursor-not-allowed': date && isPast(date),
                                                'text-slate-200 hover:bg-white/10': date && !isPast(date) && !isSelected(date),
                                                'ring-1 ring-brand-400': date && isToday(date) && !isSelected(date),
                                            }"
                                            class="h-full w-full rounded-xl text-sm transition"
                                            x-text="date ? dayNumber(date) : ''"></button>
                                </div>
                            </template>
                        </div>
                    </div>

                    <div class="mt-3 flex flex-wrap gap-2" x-show="dates.length" x-cloak>
                        <template x-for="date in dates" :key="date">
                            <span class="inline-flex items-center gap-1 rounded-full bg-brand-500/15 py-1 pr-1 pl-3 text-xs font-semibold text-brand-200">
                                <span x-text="formatShort(date)"></span>
                                <button type="button" @click="toggle(date)" class="grid h-5 w-5 place-items-center rounded-full hover:bg-white/10" :aria-label="'Remove ' + formatShort(date)">
                                    <x-icon name="x" class="h-3 w-3"/>
                                </button>
                            </span>
                        </template>
                    </div>
                </fieldset>

                <div>
                    <label for="propose-description" class="label text-slate-200">Description <span class="font-normal text-slate-400">(optional)</span></label>
                    <textarea id="propose-description" x-model="description" rows="3" :maxlength="LIMITS.description"
                              placeholder="Add details, costs, what to bring…" class="input-dark resize-none"></textarea>
                </div>
            </div>

            <div class="border-t border-white/10 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p x-show="error" x-text="error" x-cloak role="alert" class="mb-3 rounded-2xl bg-rose-500/15 px-4 py-2.5 text-sm font-medium text-rose-200"></p>
                <button type="submit" :disabled="busy" class="btn btn-primary w-full py-3">
                    <x-icon name="check" class="h-4 w-4"/>
                    <span x-text="busy ? 'Saving…' : (dates.length > 1 ? `Propose ${dates.length} dates` : 'Propose event')">Propose event</span>
                </button>
            </div>
        </form>
    </div>
</div>
