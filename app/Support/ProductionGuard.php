<?php

namespace App\Support;

use RuntimeException;

/**
 * Refuses to boot a production app that points at the Firebase emulators.
 * The Auth emulator issues unsigned ID tokens, and kreait accepts them while
 * FIREBASE_AUTH_EMULATOR_HOST is set, so that setting in production would let
 * anyone sign in as anyone.
 */
class ProductionGuard
{
    public const EMULATOR_VARS = ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST'];

    /**
     * @param  callable(string): mixed  $env  Reads an environment variable.
     *
     * @throws RuntimeException
     */
    public static function check(bool $isProduction, callable $env, bool $browserUsesEmulators): void
    {
        if (! $isProduction) {
            return;
        }

        foreach (self::EMULATOR_VARS as $name) {
            if (filled($env($name))) {
                throw new RuntimeException("{$name} must not be set in production (it would accept unsigned emulator tokens).");
            }
        }

        if ($browserUsesEmulators) {
            throw new RuntimeException('VITE_USE_FIREBASE_EMULATORS must be false in production.');
        }
    }
}
