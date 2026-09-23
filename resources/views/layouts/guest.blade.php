@extends('layouts.base')

@section('body')
    <main class="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div class="mb-8 flex items-center gap-2">
            @include('partials.logo')
            <span class="text-2xl font-semibold tracking-tight text-slate-900">{{ config('app.name') }}</span>
        </div>

        <div class="w-full max-w-sm">
            @include('partials.flash')
            @yield('content')
        </div>
    </main>
@endsection
