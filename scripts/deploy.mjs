#!/usr/bin/env node
// Deploy with a branch check, so what's live always matches a pushed commit.
//
//   npm run deploy            main branch -> production (https://planly-794a5.web.app)
//                             Hosting + Firestore rules + indexes
//   npm run deploy:staging    staging branch -> "staging" preview channel (own URL)
//                             Hosting only
//
// Both use the `prod` project alias in .firebaserc. A preview channel shares the
// production Auth users and Firestore data (and rules): only the website differs.
// Rules changes therefore go live only with a production deploy; test them in the
// emulators (npm run test:rules) first.
import { execFileSync, spawnSync } from 'node:child_process';

const TARGETS = {
    production: {
        branch: 'main',
        args: ['deploy', '--only', 'hosting,firestore:rules,firestore:indexes', '--project', 'prod'],
    },
    staging: {
        branch: 'staging',
        // Preview channels expire; each deploy restarts the clock (30 days is the maximum).
        args: ['hosting:channel:deploy', 'staging', '--expires', '30d', '--project', 'prod'],
    },
};

const name = process.argv[2];
const target = TARGETS[name];
if (!target) {
    console.error(`Usage: node scripts/deploy.mjs ${Object.keys(TARGETS).join('|')}`);
    process.exit(1);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = (message) => {
    console.error(`\n✖ Not deploying: ${message}\n`);
    process.exit(1);
};

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== target.branch) {
    fail(`${name} deploys from the "${target.branch}" branch, but you're on "${branch}".`
        + (name === 'production' ? '\n  Merge staging into main first, or use `npm run deploy:staging`.' : ''));
}

if (git('status', '--porcelain', '--untracked-files=no')) {
    fail('you have uncommitted changes. Commit (or stash) them so the deploy matches a commit.');
}

git('fetch', '--quiet', 'origin', target.branch);
const local = git('rev-parse', 'HEAD');
const remote = git('rev-parse', `origin/${target.branch}`);
if (local !== remote) {
    fail(`${target.branch} isn't in sync with origin/${target.branch}. Push (or pull) first.`);
}

console.log(`→ Deploying ${branch} @ ${local.slice(0, 7)} to ${name}…\n`);
const result = spawnSync('npx', ['firebase', ...target.args], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
