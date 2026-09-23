@extends('layouts.guest')

@section('title', 'Sign in')

@section('hero')
    <p class="text-sm font-medium text-white/80">Plans with friends, sorted</p>
    <h1 class="text-2xl font-bold tracking-tight">Find the day<br>everyone's free</h1>
@endsection

@section('content')
    <div x-data="loginForm">
        {{-- Sign in / Create account switch --}}
        <div class="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-sm font-semibold" role="tablist">
            <button type="button" role="tab" :aria-selected="!isSignup" @click="isSignup && toggleMode()"
                    :class="!isSignup ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'"
                    class="rounded-xl py-2 transition">Sign in</button>
            <button type="button" role="tab" :aria-selected="isSignup" @click="!isSignup && toggleMode()"
                    :class="isSignup ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'"
                    class="rounded-xl py-2 text-slate-500 transition">Create account</button>
        </div>

        <p class="mt-4 text-sm text-slate-500"
           x-text="isSignup ? 'An admin approves new accounts before you can join in.' : 'Welcome back! Sign in to see what’s planned.'">
            Welcome back! Sign in to see what’s planned.
        </p>

        <form class="mt-5 space-y-4" @submit.prevent="submit" novalidate>
            <div x-show="isSignup" x-cloak>
                <label for="displayName" class="label">Your name</label>
                <div class="relative">
                    <x-icon name="user" class="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"/>
                    <input id="displayName" type="text" x-model="displayName" maxlength="60" autocomplete="name"
                           placeholder="What should friends call you?" :required="isSignup" class="input pl-11">
                </div>
            </div>

            <div>
                <label for="email" class="label">Email</label>
                <div class="relative">
                    <x-icon name="mail" class="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"/>
                    <input id="email" type="email" x-model="email" required autocomplete="email" inputmode="email"
                           placeholder="you@example.com" class="input pl-11">
                </div>
            </div>

            <div>
                <div class="flex items-center justify-between">
                    <label for="password" class="label">Password</label>
                    <button type="button" x-show="!isSignup" @click="resetPassword"
                            class="mb-1.5 text-xs font-semibold text-brand-600 hover:text-brand-500">Forgot password?</button>
                </div>
                <div class="relative">
                    <x-icon name="lock" class="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"/>
                    <input id="password" type="password" x-model="password" required minlength="6"
                           :autocomplete="isSignup ? 'new-password' : 'current-password'"
                           :placeholder="isSignup ? 'At least 6 characters' : '••••••••'" class="input pl-11">
                </div>
            </div>

            <p x-show="error" x-text="error" x-cloak role="alert"
               class="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"></p>
            <p x-show="info" x-text="info" x-cloak role="status"
               class="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700"></p>

            <button type="submit" :disabled="busy" class="btn btn-primary w-full py-3">
                <svg x-show="busy" x-cloak class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"/>
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                </svg>
                <span x-text="isSignup ? 'Create account' : 'Sign in'">Sign in</span>
            </button>
        </form>
    </div>
@endsection
