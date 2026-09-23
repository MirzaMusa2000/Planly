@extends('layouts.guest')

@section('title', 'Sign in')

@section('content')
    <div x-data="loginForm" class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 class="text-xl font-semibold text-slate-900" x-text="isSignup ? 'Create your account' : 'Welcome back'">Welcome back</h1>
        <p class="mt-1 text-sm text-slate-500"
           x-text="isSignup ? 'An admin will approve you before you can join in.' : 'Sign in to plan with your friends.'">
            Sign in to plan with your friends.
        </p>

        <form class="mt-6 space-y-4" @submit.prevent="submit" novalidate>
            <div x-show="isSignup" x-cloak>
                <label for="displayName" class="block text-sm font-medium text-slate-700">Your name</label>
                <input id="displayName" type="text" x-model="displayName" maxlength="60" autocomplete="name"
                       :required="isSignup"
                       class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none sm:text-sm">
            </div>

            <div>
                <label for="email" class="block text-sm font-medium text-slate-700">Email</label>
                <input id="email" type="email" x-model="email" required autocomplete="email" inputmode="email"
                       class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none sm:text-sm">
            </div>

            <div>
                <div class="flex items-center justify-between">
                    <label for="password" class="block text-sm font-medium text-slate-700">Password</label>
                    <button type="button" x-show="!isSignup" @click="resetPassword"
                            class="text-xs font-medium text-indigo-600 hover:text-indigo-500">Forgot password?</button>
                </div>
                <input id="password" type="password" x-model="password" required minlength="6"
                       :autocomplete="isSignup ? 'new-password' : 'current-password'"
                       class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none sm:text-sm">
            </div>

            <p x-show="error" x-text="error" x-cloak role="alert"
               class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"></p>
            <p x-show="info" x-text="info" x-cloak role="status"
               class="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700"></p>

            <button type="submit" :disabled="busy"
                    class="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60">
                <svg x-show="busy" x-cloak class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"/>
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                </svg>
                <span x-text="isSignup ? 'Create account' : 'Sign in'">Sign in</span>
            </button>
        </form>

        <p class="mt-6 text-center text-sm text-slate-500">
            <span x-text="isSignup ? 'Already have an account?' : 'New here?'">New here?</span>
            <button type="button" @click="toggleMode" class="font-semibold text-indigo-600 hover:text-indigo-500"
                    x-text="isSignup ? 'Sign in' : 'Create an account'">Create an account</button>
        </p>
    </div>
@endsection
