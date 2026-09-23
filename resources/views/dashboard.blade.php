@extends('layouts.app')

@section('title', 'Home')

@php
    $firstName = \Illuminate\Support\Str::of($currentUser['displayName'] ?? '')->before(' ')->value() ?: 'there';
@endphp

@section('content')
    {{-- Hero --}}
    <section class="relative overflow-hidden rounded-3xl shadow-soft">
        @include('partials.hero-art')
        <div class="relative flex min-h-44 flex-col p-6 text-white sm:min-h-52 sm:p-8">
            <div class="flex items-center justify-between gap-4">
                <p class="text-sm font-medium text-white/85">{{ $greeting[0] }}, <span aria-hidden="true">{{ $greeting[1] }}</span></p>
                <p class="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">{{ $today->format('D, j M Y') }}</p>
            </div>
            <h1 class="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{{ $firstName }}</h1>
            <p class="mt-auto pt-6 text-sm text-white/80">Plan it together, one date at a time.</p>
        </div>
    </section>

    {{-- Phase 2 replaces this with the calendar and upcoming events. --}}
    <section class="card mt-6 flex flex-col items-center px-6 py-12 text-center">
        <div class="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500">
            <x-icon name="calendar" class="h-7 w-7"/>
        </div>
        <h2 class="mt-4 text-lg font-bold text-slate-900">Your shared calendar is on its way</h2>
        <p class="mt-1 max-w-sm text-sm text-slate-500">Soon you'll propose events here, vote on dates and see what's coming up.</p>
    </section>
@endsection
