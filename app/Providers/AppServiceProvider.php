<?php

namespace App\Providers;

use App\Support\Firebase\EmulatorAdminAuth;
use App\Support\ProductionGuard;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Kreait\Firebase\Factory;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // kreait/laravel-firebase resolves the Factory from the container, so we
        // can inject the project ID here (needed for the emulators, where there
        // may be no service account to read it from).
        $this->app->bind(Factory::class, function () {
            $factory = new Factory;

            if ($projectId = config('firebase.projects.app.project_id')) {
                $factory = $factory->withProjectId($projectId);
            }

            // Same check google/cloud-firestore uses to switch to the emulator.
            if (getenv('FIRESTORE_EMULATOR_HOST')) {
                $factory = $factory->withFirestoreClientConfig(EmulatorAdminAuth::firestoreClientConfig());
            }

            return $factory;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        ProductionGuard::check(
            $this->app->isProduction(),
            fn (string $name) => getenv($name) ?: env($name),
            (bool) config('firebase.web.useEmulators'),
        );

        if ($this->app->isProduction()) {
            // Cloud Run terminates TLS in front of the container.
            URL::forceScheme('https');
        }
    }
}
