<?php

use App\Http\Controllers\Admin\UserApprovalController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\EventController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/dashboard');

// Auth
Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
Route::post('/auth/session', [AuthController::class, 'createSession'])
    ->middleware('throttle:20,1')
    ->name('auth.session');
Route::get('/pending', [AuthController::class, 'pending'])->name('pending');
Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

// Approved members
Route::middleware('approved')->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

    Route::where(['id' => '[A-Za-z0-9_-]{1,128}'])->group(function () {
        Route::post('/events/{id}/confirm', [EventController::class, 'confirm'])->name('events.confirm');
        Route::post('/events/{id}/cancel', [EventController::class, 'cancel'])->name('events.cancel');
    });

    Route::middleware('admin')->prefix('admin')->name('admin.')->group(function () {
        Route::get('/users', [UserApprovalController::class, 'index'])->name('users.index');

        Route::whereAlphaNumeric('uid')->group(function () {
            Route::post('/users/{uid}/approve', [UserApprovalController::class, 'approve'])->name('users.approve');
            Route::post('/users/{uid}/reject', [UserApprovalController::class, 'reject'])->name('users.reject');
            Route::post('/users/{uid}/revoke', [UserApprovalController::class, 'revoke'])->name('users.revoke');
        });
    });
});
