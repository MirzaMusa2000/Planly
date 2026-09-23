@extends('layouts.base')

@section('body')
    <div class="flex min-h-full flex-col">
        <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
                <a href="{{ route('dashboard') }}" class="flex items-center gap-2">
                    @include('partials.logo', ['size' => 'h-7 w-7'])
                    <span class="hidden text-lg font-semibold tracking-tight text-slate-900 sm:inline">{{ config('app.name') }}</span>
                </a>

                <nav class="flex items-center gap-1 text-sm sm:ml-2">
                    <a href="{{ route('dashboard') }}"
                       @class([
                           'rounded-lg px-3 py-1.5 font-medium',
                           'bg-indigo-50 text-indigo-700' => request()->routeIs('dashboard'),
                           'text-slate-600 hover:bg-slate-100' => ! request()->routeIs('dashboard'),
                       ])>Calendar</a>
                    @if (($currentUser['role'] ?? null) === 'admin')
                        <a href="{{ route('admin.users.index') }}"
                           @class([
                               'rounded-lg px-3 py-1.5 font-medium',
                               'bg-indigo-50 text-indigo-700' => request()->routeIs('admin.*'),
                               'text-slate-600 hover:bg-slate-100' => ! request()->routeIs('admin.*'),
                           ])>Members</a>
                    @endif
                </nav>

                <div class="ml-auto flex items-center gap-2">
                    <span class="hidden max-w-40 truncate text-sm text-slate-600 sm:block" title="{{ $currentUser['email'] ?? '' }}">
                        {{ $currentUser['displayName'] ?? '' }}
                    </span>
                    <span class="grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-sm font-semibold text-white" aria-hidden="true">
                        {{ mb_strtoupper(mb_substr($currentUser['displayName'] ?? '?', 0, 1)) }}
                    </span>
                    <form id="logout-form" method="POST" action="{{ route('logout') }}"
                          x-data="logoutButton" @submit.prevent="logout($event)">
                        @csrf
                        <button type="submit" :disabled="busy"
                                class="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                            Sign out
                        </button>
                    </form>
                </div>
            </div>
        </header>

        <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
            @include('partials.flash')
            @yield('content')
        </main>
    </div>

    {{-- Phase 5: floating chat button goes here. --}}
@endsection
