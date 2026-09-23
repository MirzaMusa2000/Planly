@if (session('status'))
    <div class="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" role="status">
        <x-icon name="check" class="mt-0.5 h-4 w-4 shrink-0"/>
        <span>{{ session('status') }}</span>
    </div>
@endif
@if (session('error'))
    <div class="mb-5 flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800" role="alert">
        <x-icon name="x" class="mt-0.5 h-4 w-4 shrink-0"/>
        <span>{{ session('error') }}</span>
    </div>
@endif
