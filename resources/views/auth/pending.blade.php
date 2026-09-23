@extends('layouts.guest')

@section('title', 'Waiting for approval')

@section('hero')
    <p class="text-sm font-medium text-white/80">Hi {{ $pending['displayName'] ?: 'there' }} 👋</p>
    <h1 class="text-2xl font-bold tracking-tight">Almost there</h1>
@endsection

@section('content')
    <div x-data="pendingPage(@js(['uid' => $pending['uid'], 'status' => $pending['status']]))" class="text-center">

        <template x-if="status === 'pending'">
            <div>
                <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-amber-50 text-3xl" aria-hidden="true">⏳</div>
                <h2 class="mt-4 text-xl font-bold text-slate-900">Waiting for admin approval</h2>
                <p class="mt-2 text-sm text-slate-500">
                    An admin needs to approve <span class="font-semibold text-slate-700">{{ $pending['email'] }}</span>.
                    This page updates by itself once you're in.
                </p>
                <p class="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    <span class="h-2 w-2 animate-pulse rounded-full bg-amber-500"></span>
                    Waiting for approval
                </p>
            </div>
        </template>

        <template x-if="status === 'rejected'">
            <div>
                <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-rose-50 text-3xl" aria-hidden="true">🚫</div>
                <h2 class="mt-4 text-xl font-bold text-slate-900">Access denied</h2>
                <p class="mt-2 text-sm text-slate-500">
                    The admin hasn't given <span class="font-semibold text-slate-700">{{ $pending['email'] }}</span> access.
                    If you think this is a mistake, ask them directly.
                </p>
            </div>
        </template>

        <template x-if="status === 'approved'">
            <div>
                <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-emerald-50 text-3xl" aria-hidden="true">🎉</div>
                <h2 class="mt-4 text-xl font-bold text-slate-900">You're approved!</h2>
                <p class="mt-2 text-sm text-slate-500">Taking you to your calendar…</p>
            </div>
        </template>

        <p x-show="message" x-text="message" x-cloak class="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600"></p>

        <p x-show="!signedIn" x-cloak class="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You're signed out in this browser. <a href="{{ route('login') }}" class="font-semibold underline">Sign in again</a> to check your status.
        </p>

        <div class="mt-6 grid gap-2">
            <button type="button" x-show="status === 'pending' && signedIn" @click="check" :disabled="checking" class="btn btn-primary w-full py-3">
                <x-icon name="refresh" class="h-4 w-4"/>
                <span x-text="checking ? 'Checking…' : 'Check again'">Check again</span>
            </button>
            <form id="logout-form" method="POST" action="{{ route('logout') }}" @submit.prevent="logout($el)">
                @csrf
                <button type="submit" class="btn btn-secondary w-full py-3">Sign out</button>
            </form>
        </div>
    </div>
@endsection
