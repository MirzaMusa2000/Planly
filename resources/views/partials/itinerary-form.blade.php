{{-- Add / edit an itinerary item. Used inside day-panel templates (x-if needs a single root). --}}
<form data-item-form @submit.prevent="save()" class="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3" novalidate>
    <div class="grid grid-cols-2 gap-2">
        <label class="block">
            <span class="mb-1 block text-xs font-semibold text-slate-600">Start</span>
            <input type="time" x-model="form.startTime" required class="input px-3 py-2">
        </label>
        <label class="block">
            <span class="mb-1 block text-xs font-semibold text-slate-600">End <span class="font-normal text-slate-400">(optional)</span></span>
            <input type="time" x-model="form.endTime" class="input px-3 py-2">
        </label>
    </div>
    <label class="block">
        <span class="mb-1 block text-xs font-semibold text-slate-600">Activity</span>
        <input type="text" x-model="form.activity" :maxlength="ITEM_LIMITS.activity" required placeholder="Breakfast, hike, check-in…" class="input px-3 py-2">
    </label>
    <label class="block">
        <span class="mb-1 block text-xs font-semibold text-slate-600">Location <span class="font-normal text-slate-400">(optional)</span></span>
        <input type="text" x-model="form.location" :maxlength="ITEM_LIMITS.location" placeholder="Where?" class="input px-3 py-2">
    </label>
    <label class="block">
        <span class="mb-1 block text-xs font-semibold text-slate-600">Notes <span class="font-normal text-slate-400">(optional)</span></span>
        <textarea x-model="form.notes" rows="2" :maxlength="ITEM_LIMITS.notes" placeholder="Tickets, what to bring…" class="input resize-none px-3 py-2"></textarea>
    </label>

    <p x-show="formError" x-text="formError" role="alert" class="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"></p>

    <div class="flex gap-2">
        <button type="submit" :disabled="busy" class="btn btn-primary flex-1 py-2">
            <span x-text="busy ? 'Saving…' : (form.id ? 'Save changes' : 'Add')"></span>
        </button>
        <button type="button" @click="cancelForm()" class="btn btn-secondary py-2">Cancel</button>
    </div>
</form>
