@extends('layouts.guest')

@section('title', 'Waiting for approval')

@section('content')
    <div x-data="pendingPage(@js(['uid' => $pending['uid'], 'status' => $pending['status']]))"
         class="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">

        {{-- Pending --}}
        <template x-if="status === 'pending'">
            <div>
                <div class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl" aria-hidden="true">⏳</div>
                <h1 class="mt-4 text-xl font-semibold text-slate-900">Waiting for admin approval</h1>
                <p class="mt-2 text-sm text-slate-500">
                    Thanks for signing up, <span class="font-medium text-slate-700">{{ $pending['displayName'] ?: $pending['email'] }}</span>!
                    An admin needs to approve your account. This page updates on its own once you're in.
                </p>
            </div>
        </template>

        {{-- Rejected / revoked --}}
        <template x-if="status === 'rejected'">
            <div>
                <div class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-100 text-2xl" aria-hidden="true">🚫</div>
                <h1 class="mt-4 text-xl font-semibold text-slate-900">Access denied</h1>
                <p class="mt-2 text-sm text-slate-500">
                    The admin hasn't given <span class="font-medium text-slate-700">{{ $pending['email'] }}</span> access.
                    If you think this is a mistake, ask them directly.
                </p>
            </div>
        </template>

        <template x-if="status === 'approved'">
            <div>
                <div class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl" aria-hidden="true">🎉</div>
                <h1 class="mt-4 text-xl font-semibold text-slate-900">You're approved!</h1>
                <p class="mt-2 text-sm text-slate-500">Taking you to your calendar…</p>
            </div>
        </template>

        <p x-show="message" x-text="message" x-cloak class="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600"></p>

        <p x-show="!signedIn" x-cloak class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            You're signed out in this browser. <a href="{{ route('login') }}" class="font-semibold underline">Sign in again</a> to check your status.
        </p>

        <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" x-show="status === 'pending' && signedIn" @click="check" :disabled="checking"
                    class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60">
                <span x-text="checking ? 'Checking…' : 'Check again'">Check again</span>
            </button>
            <form id="logout-form" method="POST" action="{{ route('logout') }}" @submit.prevent="logout($el)">
                @csrf
                <button type="submit" class="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Sign out
                </button>
            </form>
        </div>
    </div>
@endsection
