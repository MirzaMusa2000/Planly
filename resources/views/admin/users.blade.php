@extends('layouts.app')

@section('title', 'Members')

@php
    $sections = [
        ['key' => 'pending', 'title' => 'Waiting for approval', 'users' => $pending, 'empty' => 'No one is waiting.', 'chip' => 'bg-amber-100 text-amber-700'],
        ['key' => 'approved', 'title' => 'Members', 'users' => $approved, 'empty' => 'No approved members yet.', 'chip' => 'bg-emerald-100 text-emerald-700'],
        ['key' => 'rejected', 'title' => 'Rejected or revoked', 'users' => $rejected, 'empty' => 'Nobody here.', 'chip' => 'bg-slate-200 text-slate-600'],
    ];
    // Pastel avatar backgrounds, picked per user so colours stay stable.
    $avatarColours = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700'];
@endphp

@section('content')
    <div class="mb-6">
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Members</h1>
        <p class="mt-1 text-sm text-slate-500">Approve new sign-ups and manage who can use {{ config('app.name') }}.</p>
    </div>

    <div class="space-y-8">
        @foreach ($sections as $section)
            <section aria-labelledby="section-{{ $section['key'] }}">
                <div class="mb-3 flex items-center gap-2">
                    <h2 id="section-{{ $section['key'] }}" class="text-sm font-bold text-slate-700">{{ $section['title'] }}</h2>
                    <span class="chip {{ $section['chip'] }}">{{ $section['users']->count() }}</span>
                </div>

                @if ($section['users']->isEmpty())
                    <p class="rounded-3xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">{{ $section['empty'] }}</p>
                @else
                    <ul class="card divide-y divide-slate-100 overflow-hidden">
                        @foreach ($section['users'] as $user)
                            <li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                                <div class="flex min-w-0 flex-1 items-center gap-3">
                                    <span class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-bold {{ $avatarColours[crc32($user['uid']) % count($avatarColours)] }}" aria-hidden="true">
                                        {{ mb_strtoupper(mb_substr($user['displayName'] ?: $user['email'], 0, 1)) }}
                                    </span>
                                    <div class="min-w-0">
                                        <p class="flex items-center gap-2 font-semibold text-slate-900">
                                            <span class="truncate">{{ $user['displayName'] ?: '—' }}</span>
                                            @if ($user['role'] === 'admin')
                                                <span class="chip bg-brand-100 text-brand-700">Admin</span>
                                            @endif
                                            @if ($user['uid'] === $me)
                                                <span class="chip bg-slate-100 text-slate-500">You</span>
                                            @endif
                                        </p>
                                        <p class="truncate text-sm text-slate-500">{{ $user['email'] }}</p>
                                        <p class="mt-0.5 text-xs text-slate-400">
                                            @if ($user['createdAt'])
                                                Joined {{ $user['createdAt']->format('j M Y') }}
                                            @endif
                                            @if ($section['key'] === 'approved' && $user['approvedAt'])
                                                · Approved {{ $user['approvedAt']->diffForHumans() }}
                                            @endif
                                        </p>
                                    </div>
                                </div>

                                @if ($user['uid'] !== $me)
                                    <div class="flex gap-2 sm:shrink-0">
                                        @if ($section['key'] !== 'approved')
                                            <form method="POST" action="{{ route('admin.users.approve', $user['uid']) }}" class="flex-1 sm:flex-none">
                                                @csrf
                                                <button class="btn btn-primary w-full py-2">
                                                    <x-icon name="check" class="h-4 w-4"/> Approve
                                                </button>
                                            </form>
                                        @endif
                                        @if ($section['key'] === 'pending')
                                            <form method="POST" action="{{ route('admin.users.reject', $user['uid']) }}" class="flex-1 sm:flex-none">
                                                @csrf
                                                <button class="btn btn-secondary w-full py-2">Reject</button>
                                            </form>
                                        @endif
                                        @if ($section['key'] === 'approved')
                                            <form method="POST" action="{{ route('admin.users.revoke', $user['uid']) }}" class="flex-1 sm:flex-none"
                                                  x-data @submit="if (! confirm(@js('Revoke access for '.($user['displayName'] ?: $user['email']).'? They will be signed out.'))) $event.preventDefault()">
                                                @csrf
                                                <button class="btn btn-danger w-full py-2">Revoke</button>
                                            </form>
                                        @endif
                                    </div>
                                @endif
                            </li>
                        @endforeach
                    </ul>
                @endif
            </section>
        @endforeach
    </div>
@endsection
