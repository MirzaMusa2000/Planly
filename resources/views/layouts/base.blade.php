<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="h-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="theme-color" content="#0b1020">
    <title>@hasSection('title')@yield('title') · @endif{{ config('app.name') }}</title>

    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=plus-jakarta-sans:400,500,600,700,800" rel="stylesheet">

    @php
        // Blade's @json must stay on one line, so build the payload first.
        $planlyBoot = [
            'user' => $currentUser ?? null,
            'timezone' => config('app.timezone'),
            'firebase' => config('firebase.web'),
        ];
    @endphp
    <script>
        window.Planly = @json($planlyBoot);
    </script>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @stack('head')
</head>
<body class="h-full font-sans text-slate-800 antialiased">
    @yield('body')
</body>
</html>
