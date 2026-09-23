<?php

namespace Tests\Unit;

use App\Support\ProductionGuard;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class ProductionGuardTest extends TestCase
{
    private function env(array $values): callable
    {
        return fn (string $name) => $values[$name] ?? null;
    }

    public function test_local_may_use_emulators(): void
    {
        ProductionGuard::check(false, $this->env(['FIREBASE_AUTH_EMULATOR_HOST' => '127.0.0.1:9099']), true);
        $this->addToAssertionCount(1);
    }

    public function test_clean_production_boots(): void
    {
        ProductionGuard::check(true, $this->env([]), false);
        $this->addToAssertionCount(1);
    }

    public function test_production_refuses_the_auth_emulator(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('FIREBASE_AUTH_EMULATOR_HOST');

        ProductionGuard::check(true, $this->env(['FIREBASE_AUTH_EMULATOR_HOST' => '127.0.0.1:9099']), false);
    }

    public function test_production_refuses_the_firestore_emulator(): void
    {
        $this->expectException(RuntimeException::class);

        ProductionGuard::check(true, $this->env(['FIRESTORE_EMULATOR_HOST' => '127.0.0.1:8080']), false);
    }

    public function test_production_refuses_browser_emulators(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('VITE_USE_FIREBASE_EMULATORS');

        ProductionGuard::check(true, $this->env([]), true);
    }
}
