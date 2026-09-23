{{-- Shared error page. Each errors/{code}.blade.php sets $code, $title, $emoji, $message (and optional $actionUrl, $actionLabel) then extends this. --}}
@extends('layouts.guest')

@section('title', $title)

@section('hero')
    <p class="text-sm font-medium text-white/80">Error {{ $code }}</p>
    <h1 class="text-2xl font-bold tracking-tight">{{ $title }}</h1>
@endsection

@section('content')
    <div class="text-center">
        <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand-50 text-3xl" aria-hidden="true">{{ $emoji }}</div>
        <p class="mt-4 text-sm text-slate-600">{{ $message }}</p>
        <div class="mt-6 grid gap-2">
            <a href="{{ $actionUrl ?? url('/dashboard') }}" class="btn btn-primary w-full py-3">{{ $actionLabel ?? 'Back to the calendar' }}</a>
        </div>
    </div>
@endsection
