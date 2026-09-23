@extends('layouts.base')

@section('body')
    <main class="flex min-h-full items-center justify-center px-4 py-8">
        <div class="w-full max-w-md">
            <div class="card overflow-hidden">
                <div class="relative h-44">
                    @include('partials.hero-art')
                    <div class="relative flex h-full flex-col justify-between p-6 text-white">
                        <div class="flex items-center gap-2.5">
                            @include('partials.logo', ['size' => 'h-8 w-8'])
                            <span class="text-lg font-bold tracking-tight">{{ config('app.name') }}</span>
                        </div>
                        <div>@yield('hero')</div>
                    </div>
                </div>

                <div class="p-6 sm:p-8">
                    @include('partials.flash')
                    @yield('content')
                </div>
            </div>

            <p class="mt-6 text-center text-xs text-slate-400">Plan it together, one date at a time.</p>
        </div>
    </main>
@endsection
