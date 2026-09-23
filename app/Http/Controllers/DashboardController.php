<?php

namespace App\Http\Controllers;

use Illuminate\View\View;

class DashboardController extends Controller
{
    public function index(): View
    {
        $now = now(); // APP_TIMEZONE (Asia/Kuala_Lumpur)

        return view('dashboard', [
            'greeting' => match (true) {
                $now->hour < 12 => ['Good morning', '☀️'],
                $now->hour < 18 => ['Good afternoon', '🌤️'],
                default => ['Good evening', '🌙'],
            },
            'today' => $now,
        ]);
    }
}
