@extends('layouts.app')

@section('title', 'Members')

@php
    $sections = [
        ['key' => 'pending', 'title' => 'Waiting for approval', 'users' => $pending, 'empty' => 'No one is waiting.', 'accent' => 'bg-amber-100 text-amber-800'],
        ['key' => 'approved', 'title' => 'Members', 'users' => $approved, 'empty' => 'No approved members yet.', 'accent' => 'bg-emerald-100 text-emerald-800'],
        ['key' => 'rejected', 'title' => 'Rejected or revoked', 'users' => $rejected, 'empty' => 'Nobody here.', 'accent' => 'bg-slate-200 text-slate-700'],
    ];
@endphp

@section('content')
    <div class="mb-6">
        <h1 class="text-xl font-semibold text-slate-900">Members</h1>
        <p class="mt-1 text-sm text-slate-500">Approve new sign-ups and manage who can use {{ config('app.name') }}.</p>
    </div>

    <div class="space-y-8">
        @foreach ($sections as $section)
            <section aria-labelledby="section-{{ $section['key'] }}">
                <div class="mb-3 flex items-center gap-2">
                    <h2 id="section-{{ $section['key'] }}" class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ $section['title'] }}</h2>
                    <span class="rounded-full px-2 py-0.5 text-xs font-semibold {{ $section['accent'] }}">{{ $section['users']->count() }}</span>
                </div>

                @if ($section['users']->isEmpty())
                    <p class="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{{ $section['empty'] }}</p>
                @else
                    <ul class="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        @foreach ($section['users'] as $user)
                            <li class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                                <div class="flex min-w-0 flex-1 items-center gap-3">
                                    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-100 font-semibold text-indigo-700" aria-hidden="true">
                                        {{ mb_strtoupper(mb_substr($user['displayName'] ?: $user['email'], 0, 1)) }}
                                    </span>
                                    <div class="min-w-0">
                                        <p class="flex items-center gap-2 truncate font-medium text-slate-900">
                                            <span class="truncate">{{ $user['displayName'] ?: '—' }}</span>
                                            @if ($user['role'] === 'admin')
                                                <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">Admin</span>
                                            @endif
                                            @if ($user['uid'] === $me)
                                                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">You</span>
                                            @endif
                                        </p>
                                        <p class="truncate text-sm text-slate-500">{{ $user['email'] }}</p>
                                        <p class="text-xs text-slate-400">
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
                                                <button class="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Approve</button>
                                            </form>
                                        @endif
                                        @if ($section['key'] === 'pending')
                                            <form method="POST" action="{{ route('admin.users.reject', $user['uid']) }}" class="flex-1 sm:flex-none">
                                                @csrf
                                                <button class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reject</button>
                                            </form>
                                        @endif
                                        @if ($section['key'] === 'approved')
                                            <form method="POST" action="{{ route('admin.users.revoke', $user['uid']) }}" class="flex-1 sm:flex-none"
                                                  x-data @submit="if (! confirm(@js('Revoke access for '.($user['displayName'] ?: $user['email']).'? They will be signed out.'))) $event.preventDefault()">
                                                @csrf
                                                <button class="w-full rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Revoke</button>
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
