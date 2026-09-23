@extends('layouts.base')

@php
    $isAdmin = ($currentUser['role'] ?? null) === 'admin';
    $initial = mb_strtoupper(mb_substr($currentUser['displayName'] ?? '?', 0, 1));
    $nav = array_values(array_filter([
        ['route' => 'dashboard', 'active' => 'dashboard', 'label' => 'Home', 'icon' => 'home'],
        $isAdmin ? ['route' => 'admin.users.index', 'active' => 'admin.*', 'label' => 'Members', 'icon' => 'users'] : null,
    ]));
    // The propose form lives on the dashboard; elsewhere "+" links there and opens it.
    $onDashboard = request()->routeIs('dashboard');
    $proposeAttrs = $onDashboard
        ? 'type="button" x-data @click="$dispatch(\'propose-event\')"'
        : 'href="'.e(route('dashboard')).'#propose"';
    $proposeTag = $onDashboard ? 'button' : 'a';
@endphp

@section('body')
    {{-- One logout form for the whole page; buttons point at it with form="logout-form". --}}
    <form id="logout-form" method="POST" action="{{ route('logout') }}" class="hidden"
          x-data="logoutButton" @submit.prevent="logout($event)">
        @csrf
    </form>

    {{-- Desktop sidebar --}}
    <aside class="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-ink-950 px-4 py-6 lg:flex">
        <a href="{{ route('dashboard') }}" class="flex items-center gap-2.5 px-2">
            @include('partials.logo', ['size' => 'h-9 w-9'])
            <span class="text-xl font-bold tracking-tight text-white">{{ config('app.name') }}</span>
        </a>

        <{{ $proposeTag }} {!! $proposeAttrs !!} class="btn btn-primary mt-8 w-full py-3">
            <x-icon name="plus" class="h-4 w-4"/> Propose event
        </{{ $proposeTag }}>

        <nav class="mt-6 space-y-1" aria-label="Main">
            @foreach ($nav as $item)
                <a href="{{ route($item['route']) }}"
                   @class(['nav-link', 'nav-link-active' => request()->routeIs($item['active'])])
                   @if (request()->routeIs($item['active'])) aria-current="page" @endif>
                    <x-icon :name="$item['icon']"/>
                    {{ $item['label'] }}
                </a>
            @endforeach
        </nav>

        <div class="mt-auto flex items-center gap-3 rounded-2xl bg-ink-900 p-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-300 to-brand-600 text-sm font-bold text-white" aria-hidden="true">{{ $initial }}</span>
            <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-white">{{ $currentUser['displayName'] ?? '' }}</p>
                <p class="truncate text-xs text-slate-400">{{ $isAdmin ? 'Admin' : 'Member' }}</p>
            </div>
            <button type="submit" form="logout-form" title="Sign out"
                    class="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white">
                <x-icon name="logout" class="h-[18px] w-[18px]"/>
                <span class="sr-only">Sign out</span>
            </button>
        </div>
    </aside>

    <div class="flex min-h-full flex-col lg:pl-64">
        {{-- Mobile header --}}
        <header class="sticky top-0 z-30 flex h-14 items-center gap-2.5 bg-canvas/80 px-4 backdrop-blur lg:hidden">
            @include('partials.logo', ['size' => 'h-8 w-8'])
            <span class="text-lg font-bold tracking-tight text-slate-900">{{ config('app.name') }}</span>
            <span class="ml-auto grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-300 to-brand-600 text-sm font-bold text-white" aria-hidden="true">{{ $initial }}</span>
        </header>

        <main class="mx-auto w-full max-w-6xl flex-1 px-4 pt-2 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">
            @include('partials.flash')
            @yield('content')
        </main>
    </div>

    {{-- Mobile bottom tab bar --}}
    <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
        <div class="mx-auto flex h-16 max-w-md items-stretch px-2">
            <div class="flex flex-1 items-stretch justify-around">
                @foreach ($nav as $item)
                    <a href="{{ route($item['route']) }}"
                       @class([
                           'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                           'text-brand-600' => request()->routeIs($item['active']),
                           'text-slate-400' => ! request()->routeIs($item['active']),
                       ])>
                        <x-icon :name="$item['icon']" class="h-[22px] w-[22px]"/>
                        {{ $item['label'] }}
                    </a>
                @endforeach
            </div>

            {{-- Centre "+" --}}
            <div class="flex w-20 items-start justify-center">
                <{{ $proposeTag }} {!! $proposeAttrs !!} class="-mt-5 grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-white shadow-lift ring-4 ring-white transition hover:bg-brand-600">
                    <x-icon name="plus" class="h-6 w-6"/>
                    <span class="sr-only">Propose event</span>
                </{{ $proposeTag }}>
            </div>

            <div class="flex flex-1 items-stretch justify-around">
                <button type="submit" form="logout-form" class="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-400">
                    <x-icon name="logout" class="h-[22px] w-[22px]"/>
                    Sign out
                </button>
            </div>
        </div>
    </nav>

    {{-- Toasts --}}
    <div x-data class="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        <template x-for="t in $store.toast.items" :key="t.id">
            <div x-transition.opacity class="pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg"
                 :class="t.type === 'error' ? 'bg-rose-600 text-white' : 'bg-ink-900 text-white'">
                <span x-text="t.type === 'error' ? '⚠️' : '✅'" aria-hidden="true"></span>
                <span x-text="t.message"></span>
            </div>
        </template>
    </div>

    @include('partials.chat')
@endsection
