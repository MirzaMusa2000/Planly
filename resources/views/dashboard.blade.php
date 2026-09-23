@extends('layouts.app')

@section('title', 'Calendar')

@section('content')
    <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 class="text-xl font-semibold text-slate-900">Hi {{ $currentUser['displayName'] }} 👋</h1>
        <p class="mt-1 text-sm text-slate-500">You're in. The shared calendar arrives in the next phase.</p>
    </div>
@endsection
