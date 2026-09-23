<?php

namespace App\Support\Firebase;

use Closure;
use Google\Auth\HttpHandler\HttpHandlerFactory;
use GuzzleHttp\Client;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use Psr\Http\Message\RequestInterface;

/**
 * Admin-SDK plumbing used ONLY with the Firebase Emulator Suite.
 *
 * The emulators don't need real OAuth tokens: they treat "Bearer owner" as an
 * admin that bypasses security rules. Out of the box, though:
 *  - kreait (Auth) insists on Google credentials and fetches an OAuth token
 *    before every request, and
 *  - google/cloud-firestore sends no credentials at all to the emulator, so
 *    the server's writes would be checked against firestore.rules.
 *
 * Wiring:
 *  - fakeServiceAccount() + middleware(): config/firebase.php, when
 *    FIREBASE_AUTH_EMULATOR_HOST is set.
 *  - firestoreClientConfig(): AppServiceProvider, when FIRESTORE_EMULATOR_HOST is set.
 */
class EmulatorAdminAuth
{
    /**
     * A syntactically valid but useless service account, so kreait can
     * build its client without a real key file.
     */
    public static function fakeServiceAccount(string $projectId): array
    {
        return [
            'type' => 'service_account',
            'project_id' => $projectId,
            'client_email' => "emulator@{$projectId}.iam.gserviceaccount.com",
            'private_key' => "-----BEGIN PRIVATE KEY-----\nemulator\n-----END PRIVATE KEY-----\n",
        ];
    }

    /**
     * Firestore client options for the emulator. google/cloud-firestore drops
     * all credentials in emulator mode, which makes the emulator apply security
     * rules to the server too. Force the REST transport and send "Bearer owner"
     * so the Admin SDK bypasses rules, as it does in production.
     */
    public static function firestoreClientConfig(): array
    {
        $stack = HandlerStack::create();
        $stack->push(Middleware::mapRequest(
            fn (RequestInterface $request) => $request->withHeader('Authorization', 'Bearer owner')
        ));
        $handler = HttpHandlerFactory::build(new Client(['handler' => $stack]));

        return [
            'transport' => 'rest',
            'transportConfig' => ['rest' => ['httpHandler' => [$handler, 'async']]],
        ];
    }

    public static function middleware(callable $handler): Closure
    {
        return function (RequestInterface $request, array $options) use ($handler) {
            // Stop google/auth's AuthTokenMiddleware from fetching an OAuth token.
            unset($options['auth']);

            return $handler($request->withHeader('Authorization', 'Bearer owner'), $options);
        };
    }
}
