@extends('layouts.app')

@section('title', 'Home')

@php
    $firstName = \Illuminate\Support\Str::of($currentUser['displayName'] ?? '')->before(' ')->value() ?: 'there';
@endphp

@section('content')
    {{-- Hero --}}
    <section class="relative overflow-hidden rounded-3xl shadow-soft">
        @include('partials.hero-art')
        <div class="relative flex min-h-40 flex-col p-6 text-white sm:min-h-48 sm:p-8">
            <div class="flex items-center justify-between gap-4">
                <p class="text-sm font-medium text-white/85">{{ $greeting[0] }}, <span aria-hidden="true">{{ $greeting[1] }}</span></p>
                <p class="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">{{ $today->format('D, j M Y') }}</p>
            </div>
            <h1 class="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{{ $firstName }}</h1>
            <p class="mt-auto pt-6 text-sm text-white/80">Plan it together, one date at a time.</p>
        </div>
    </section>

    {{-- Stats --}}
    <section x-data class="mt-4 grid grid-cols-3 gap-3" aria-label="Summary">
        @foreach ([
            ['label' => 'Upcoming', 'value' => '$store.planner.upcoming.length', 'icon' => 'calendar', 'tone' => 'bg-emerald-50 text-emerald-600'],
            ['label' => 'Proposals', 'value' => '$store.planner.proposals.length', 'icon' => 'clock', 'tone' => 'bg-amber-50 text-amber-600'],
            ['label' => 'Members', 'value' => '$store.planner.approvedCount', 'icon' => 'users', 'tone' => 'bg-brand-50 text-brand-600'],
        ] as $stat)
            <div class="card p-3 sm:p-4">
                <div class="flex items-center justify-between gap-2">
                    <p class="text-2xl font-bold text-slate-900">
                        <span x-show="!$store.planner.loading" x-text="{{ $stat['value'] }}"></span>
                        <span x-show="$store.planner.loading" class="inline-block h-6 w-8 animate-pulse rounded-lg bg-slate-100"></span>
                    </p>
                    <span class="grid h-8 w-8 shrink-0 place-items-center rounded-xl {{ $stat['tone'] }}">
                        <x-icon :name="$stat['icon']" class="h-4 w-4"/>
                    </span>
                </div>
                <p class="mt-1 truncate text-xs font-semibold text-slate-500 sm:text-sm">{{ $stat['label'] }}</p>
            </div>
        @endforeach
    </section>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {{-- Calendar --}}
        <section x-data="calendarView" class="card min-w-0 p-4 sm:p-6" aria-labelledby="calendar-title">
            <div class="flex flex-wrap items-center gap-3">
                <h2 id="calendar-title" class="mr-auto text-xl font-bold text-slate-900" x-text="title">Calendar</h2>
                <button type="button" @click="$dispatch('propose-event')" class="btn btn-primary hidden py-2 sm:inline-flex">
                    <x-icon name="plus" class="h-4 w-4"/> Propose event
                </button>
            </div>

            <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-1">
                    <button type="button" @click="prev()" class="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Previous">
                        <x-icon name="chevron-left" class="h-4 w-4"/>
                    </button>
                    <button type="button" @click="goToday()" class="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Today</button>
                    <button type="button" @click="next()" class="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Next">
                        <x-icon name="chevron-right" class="h-4 w-4"/>
                    </button>
                </div>

                <div class="flex rounded-2xl bg-slate-100 p-1 text-xs font-semibold" role="group" aria-label="Calendar view">
                    <template x-for="v in views" :key="v.id">
                        <button type="button" @click="changeView(v.id)" :aria-pressed="view === v.id"
                                :class="view === v.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                                class="rounded-xl px-3 py-1.5 transition" x-text="v.label"></button>
                    </template>
                </div>
            </div>

            <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
                <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-amber-400"></span>Proposed</span>
                <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>Confirmed</span>
                <span class="inline-flex items-center gap-1.5">⭐ Everyone free</span>
            </div>

            <p x-show="$store.planner.error" x-text="$store.planner.error" x-cloak role="alert"
               class="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"></p>

            <div class="relative mt-4">
                <div x-ref="calendar" class="planly-calendar"></div>
                <div x-show="$store.planner.loading" x-transition.opacity class="absolute inset-0 grid place-items-center rounded-2xl bg-white/60">
                    <svg class="h-6 w-6 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none" aria-label="Loading">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"/>
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                    </svg>
                </div>
            </div>
        </section>

        <div class="space-y-6">
            {{-- Upcoming (confirmed, today or later) --}}
            <section x-data class="card p-5" aria-labelledby="upcoming-title">
                <h2 id="upcoming-title" class="text-base font-bold text-slate-900">Upcoming events</h2>

                <template x-if="!$store.planner.loading && $store.planner.upcoming.length === 0">
                    <p class="mt-3 rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                        Nothing confirmed yet. Once a date is picked it shows up here.
                    </p>
                </template>

                <ul class="mt-3 space-y-2">
                    <template x-for="e in $store.planner.upcoming" :key="e.id">
                        <li class="rounded-2xl border border-slate-100 p-3 transition hover:border-emerald-200">
                            <button type="button" @click="$store.planner.open(e.id)" class="flex w-full items-center gap-3 text-left">
                                <span class="grid w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 py-1.5 text-emerald-700">
                                    <span class="text-[10px] font-bold tracking-wide uppercase" x-text="$dates.month(e.finalDate)"></span>
                                    <span class="text-lg leading-none font-bold" x-text="$dates.day(e.finalDate)"></span>
                                </span>
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate font-semibold text-slate-900" x-text="e.title"></span>
                                    <span class="block truncate text-xs text-slate-500" x-text="$dates.weekday(e.finalDate) + (e.location ? ' · ' + e.location : '')"></span>
                                </span>
                            </button>

                            {{-- Inline RSVP --}}
                            <div class="mt-2.5 grid grid-cols-2 gap-2" role="group" :aria-label="'RSVP for ' + e.title">
                                <button type="button" @click="$store.planner.rsvp(e, 'join')"
                                        :disabled="$store.planner.isPending(e.id + ':rsvp')"
                                        :aria-pressed="$store.planner.myVote(e.id).rsvp === 'join'"
                                        :class="$store.planner.myVote(e.id).rsvp === 'join'
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'"
                                        class="rounded-xl px-2 py-1.5 text-xs font-bold transition disabled:opacity-60">
                                    Join · <span x-text="e.rsvpSummary.join"></span>
                                </button>
                                <button type="button" @click="$store.planner.rsvp(e, 'not_available')"
                                        :disabled="$store.planner.isPending(e.id + ':rsvp')"
                                        :aria-pressed="$store.planner.myVote(e.id).rsvp === 'not_available'"
                                        :class="$store.planner.myVote(e.id).rsvp === 'not_available'
                                            ? 'bg-slate-700 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                                        class="rounded-xl px-2 py-1.5 text-xs font-bold transition disabled:opacity-60">
                                    Not available · <span x-text="e.rsvpSummary.notAvailable"></span>
                                </button>
                            </div>
                        </li>
                    </template>
                </ul>
            </section>

            {{-- Open proposals --}}
            <section x-data class="card p-5" aria-labelledby="proposals-title">
                <h2 id="proposals-title" class="text-base font-bold text-slate-900">Open proposals</h2>

                <template x-if="!$store.planner.loading && $store.planner.proposals.length === 0">
                    <div class="mt-3 rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                        <p>No open proposals.</p>
                        <button type="button" @click="$dispatch('propose-event')" class="mt-2 font-semibold text-brand-600 hover:text-brand-500">Propose the first one</button>
                    </div>
                </template>

                <ul class="mt-3 space-y-2">
                    <template x-for="e in $store.planner.proposals" :key="e.id">
                        <li>
                            <button type="button" @click="$store.planner.open(e.id)"
                                    class="flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left transition hover:border-amber-200 hover:bg-amber-50/40">
                                <span class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                                    <x-icon name="calendar" class="h-5 w-5"/>
                                </span>
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate font-semibold text-slate-900" x-text="e.title"></span>
                                    <span class="block truncate text-xs text-slate-500"
                                          x-text="e.candidateDates.length + (e.candidateDates.length === 1 ? ' date' : ' dates') + ' · by ' + (e.proposedByName || 'someone')"></span>
                                    <span class="mt-1 flex flex-wrap gap-1">
                                        <span x-show="$store.planner.hasVoted(e.id)" class="chip bg-emerald-100 text-emerald-700">✓ You voted</span>
                                        <span x-show="!$store.planner.hasVoted(e.id)" class="chip bg-brand-100 text-brand-700">Vote now</span>
                                        <span x-show="$store.planner.hasEveryoneFreeDate(e)" class="chip bg-amber-100 text-amber-700">⭐ Everyone free</span>
                                    </span>
                                </span>
                            </button>
                        </li>
                    </template>
                </ul>
            </section>
        </div>
    </div>

    {{-- Overlays: day panel (z-50) sits below the event sheet / propose form (z-60) it can open. --}}
    @include('partials.day-panel')
    @include('partials.propose-modal')
    @include('partials.event-sheet')
@endsection
