<?php

namespace App\Console\Commands;

use App\Services\FirebaseAuthService;
use App\Services\FirestoreUserService;
use Illuminate\Console\Command;

class MakeAdmin extends Command
{
    protected $signature = 'app:make-admin {email : Email of an existing Firebase Auth user}';

    protected $description = 'Promote a Firebase user to an approved admin (bootstrap)';

    public function handle(FirebaseAuthService $auth, FirestoreUserService $users): int
    {
        $email = strtolower(trim($this->argument('email')));

        $fbUser = $auth->findByEmail($email);

        if ($fbUser === null) {
            $this->error("No Firebase user found for {$email}. Sign up at /login first, then run this again.");

            return self::FAILURE;
        }

        $users->makeAdmin($fbUser['uid'], $fbUser['email'], $fbUser['displayName']);
        $auth->setClaims($fbUser['uid'], true, true);

        $this->info("{$fbUser['email']} ({$fbUser['uid']}) is now an approved admin.");
        $this->line('If they are on the "Waiting for approval" page, click "Check again". Otherwise sign in.');

        return self::SUCCESS;
    }
}
