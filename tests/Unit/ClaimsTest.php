<?php

namespace Tests\Unit;

use App\Services\FirebaseAuthService;
use PHPUnit\Framework\TestCase;

class ClaimsTest extends TestCase
{
    public function test_claims_for_each_state(): void
    {
        $this->assertSame([], FirebaseAuthService::claimsFor(false, false));
        $this->assertSame([], FirebaseAuthService::claimsFor(false, true));
        $this->assertSame(['approved' => true], FirebaseAuthService::claimsFor(true, false));
        $this->assertSame(['approved' => true, 'admin' => true], FirebaseAuthService::claimsFor(true, true));
    }
}
