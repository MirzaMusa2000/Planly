{{-- Sunset lake-and-skyline banner. Decorative; fills its (relative) parent. --}}
<svg class="{{ $class ?? 'absolute inset-0 h-full w-full' }}" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#4338ca"/>
            <stop offset=".38" stop-color="#8b6fe0"/>
            <stop offset=".62" stop-color="#e59ac0"/>
            <stop offset=".74" stop-color="#f8b489"/>
        </linearGradient>
        <radialGradient id="hero-sun" cx="610" cy="182" r="150" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ffe3b3" stop-opacity=".95"/>
            <stop offset=".25" stop-color="#ffc59a" stop-opacity=".55"/>
            <stop offset="1" stop-color="#ffb08a" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hero-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#8c74d6"/>
            <stop offset="1" stop-color="#2c2470"/>
        </linearGradient>
        <linearGradient id="hero-shade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#1e1b4b" stop-opacity=".55"/>
            <stop offset=".55" stop-color="#1e1b4b" stop-opacity="0"/>
        </linearGradient>
    </defs>

    <rect width="800" height="300" fill="url(#hero-sky)"/>
    <rect width="800" height="300" fill="url(#hero-sun)"/>
    <circle cx="610" cy="186" r="34" fill="#ffe6c2" opacity=".85"/>

    {{-- clouds --}}
    <g fill="#fff" opacity=".16">
        <ellipse cx="180" cy="70" rx="120" ry="10"/>
        <ellipse cx="520" cy="48" rx="150" ry="9"/>
        <ellipse cx="700" cy="110" rx="90" ry="7"/>
        <ellipse cx="360" cy="120" rx="70" ry="6"/>
    </g>

    {{-- mountains, far to near --}}
    <path d="M0 196 L70 160 L140 178 L230 134 L320 176 L400 152 L470 182 L520 170 L560 196 Z" fill="#8d77d4" opacity=".75"/>
    <path d="M0 206 L90 176 L170 196 L250 164 L330 200 L420 180 L500 204 Z" fill="#6c58b8"/>
    <path d="M540 204 L610 186 L680 196 L760 170 L800 182 L800 206 Z" fill="#6c58b8" opacity=".85"/>

    {{-- skyline --}}
    <g fill="#3a2f7d">
        <rect x="628" y="170" width="10" height="36"/><rect x="641" y="150" width="8" height="56"/>
        <rect x="652" y="162" width="12" height="44"/><rect x="667" y="120" width="7" height="86"/>
        <path d="M667 120 L670.5 104 L674 120 Z"/>
        <rect x="677" y="158" width="12" height="48"/><rect x="692" y="172" width="10" height="34"/>
        <rect x="705" y="164" width="9" height="42"/><rect x="717" y="178" width="14" height="28"/>
        <rect x="734" y="170" width="8" height="36"/>
    </g>
    <g fill="#ffd9a8" opacity=".9">
        <rect x="644" y="160" width="2" height="2"/><rect x="656" y="172" width="2" height="2"/>
        <rect x="669.5" y="136" width="2" height="2"/><rect x="669.5" y="150" width="2" height="2"/>
        <rect x="681" y="168" width="2" height="2"/><rect x="708" y="176" width="2" height="2"/>
        <rect x="721" y="186" width="2" height="2"/><rect x="696" y="182" width="2" height="2"/>
    </g>

    {{-- water with sun reflection --}}
    <rect y="205" width="800" height="95" fill="url(#hero-water)"/>
    <g fill="#ffe3b3" opacity=".55">
        <rect x="580" y="214" width="60" height="2.5" rx="1.2"/>
        <rect x="592" y="224" width="38" height="2" rx="1"/>
        <rect x="600" y="234" width="22" height="2" rx="1"/>
        <rect x="604" y="244" width="14" height="1.5" rx=".75"/>
    </g>
    <path d="M0 212 L160 218 L300 212 L420 218 L520 212" stroke="#fff" stroke-opacity=".12" stroke-width="1.5" fill="none"/>

    {{-- legibility shade behind text on the left --}}
    <rect width="800" height="300" fill="url(#hero-shade)"/>
</svg>
