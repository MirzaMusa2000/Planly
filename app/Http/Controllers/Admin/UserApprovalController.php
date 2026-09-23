<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\FirebaseAuthService;
use App\Services\FirestoreUserService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class UserApprovalController extends Controller
{
    public function __construct(
        private FirebaseAuthService $auth,
        private FirestoreUserService $users,
    ) {}

    public function index(Request $request): View
    {
        $groups = collect($this->users->all())->groupBy('status');

        return view('admin.users', [
            'pending' => $groups->get(FirestoreUserService::PENDING, collect()),
            'approved' => $groups->get(FirestoreUserService::APPROVED, collect()),
            'rejected' => $groups->get(FirestoreUserService::REJECTED, collect()),
            'me' => $request->session()->get('user.uid'),
        ]);
    }

    public function approve(Request $request, string $uid): RedirectResponse
    {
        $user = $this->target($request, $uid);

        if ($user['status'] === FirestoreUserService::APPROVED) {
            return back()->with('status', "{$this->label($user)} is already approved.");
        }

        // Claims first: the user's browser may refresh its token as soon as it
        // sees the Firestore status change.
        $this->auth->setClaims($uid, true, $user['role'] === FirestoreUserService::ROLE_ADMIN);
        $this->users->approve($uid, $request->session()->get('user.uid'));

        return back()->with('status', "Approved {$this->label($user)}.");
    }

    public function reject(Request $request, string $uid): RedirectResponse
    {
        $user = $this->target($request, $uid);

        $this->block($uid);

        return back()->with('status', "Rejected {$this->label($user)}.");
    }

    public function revoke(Request $request, string $uid): RedirectResponse
    {
        $user = $this->target($request, $uid);

        $this->block($uid);

        return back()->with('status', "Revoked access for {$this->label($user)}.");
    }

    private function block(string $uid): void
    {
        $this->users->reject($uid);
        $this->auth->setClaims($uid, false);
        $this->auth->revokeSessions($uid);
    }

    /** Load the target user, refusing unknown users and self-moderation. */
    private function target(Request $request, string $uid): array
    {
        abort_if($uid === $request->session()->get('user.uid'), 422, "You can't change your own access.");

        $user = $this->users->find($uid);
        abort_if($user === null, 404);

        return $user;
    }

    private function label(array $user): string
    {
        return $user['displayName'] ?: $user['email'];
    }
}
