@php
    // Unique per instance: a gradient defined inside a hidden (display:none)
    // copy of the logo would otherwise not render for the visible one.
    $gradientId = 'planly-logo-'.\Illuminate\Support\Str::random(6);
@endphp
<svg class="{{ $size ?? 'h-9 w-9' }}" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <defs>
        <linearGradient id="{{ $gradientId }}" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stop-color="#a5b4fc"/>
            <stop offset="1" stop-color="#6366f1"/>
        </linearGradient>
    </defs>
    <rect x="6.1" y="6.1" width="19.8" height="19.8" rx="5" transform="rotate(45 16 16)" fill="url(#{{ $gradientId }})"/>
    <path d="M11.5 16.2l3 3 6-6.4" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
