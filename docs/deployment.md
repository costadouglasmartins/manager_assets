# Deployment to the existing VPS

The `Deploy manager_assets` workflow publishes pushes to `main` to
`/var/www/izzidoro.com.br/public/manager_assets/` on `179.236.252.5`.
It uses the existing Nginx/PHP installation.

## Configuration

In this repository, open **Settings > Secrets and variables > Actions** and add:

| Secret | Value |
| --- | --- |
| `SSH_HOST` | `179.236.252.5` |
| `SSH_USER` | `root` |
| `SSH_PORT` | `22` |
| `SSH_PRIVATE_KEY` | Contents of the existing deployment private key |

The matching public key must be authorized in `/root/.ssh/authorized_keys`.
The server host key is pinned in `.github/deploy/known_hosts`.
PHP, Python 3, rsync, curl, and flock must be installed on the VPS, and the destination
directory must already exist. PHP-FPM and Nginx must be running.

## Deployment behavior

Code is staged in a private temporary directory outside the web root. All three
repository deployments use `/var/lock/manager-deploy.lock` while applying files
and checking health, so shared dependencies and application code are not updated
by simultaneous deployments. The lock waits for up to ten minutes.

This repository currently contains a tracked `vendor/` directory. The workflow
publishes that committed artifact together with `composer.json`, `composer.lock`,
and the static libraries. Composer is not required on the VPS for this workflow.
When dependencies change, run Composer in development and commit a consistent
lock file and vendor tree. The staged autoloader and the three direct dependency
classes are loaded with the production PHP CLI before copying any files.
Both application login entry points are checked after deployment.

The web server must keep `vendor`, Composer manifests, and other private files
inaccessible over HTTP, allowing only the public static library paths already
configured. Runtime data and `.env` files are excluded from synchronization.

Files present only on the server are preserved, including files removed from Git.
Removing obsolete code now requires a separate reviewed operation. Overwritten
files are backed up under
`/var/backups/manager_assets/<commit>-<run>-<attempt>`. These are partial file backups of overwritten files,
not complete snapshots or database backups. Newly introduced files are not
included in the backups. The copy is not an atomic switch of the whole tree;
a failed health check reports failure without automatic rollback.

## Activation

Configure the Secrets and review the synchronization in dry-run mode before
merging this workflow into `main`. Each subsequent push to `main` deploys that
commit. A manual run through **Actions > Deploy manager_assets > Run workflow** is also
available on `main`; runs on the setup branch simulate without publishing files.

The workflow does not import databases or restart Nginx, PHP-FPM, or persistent
application processes. Database schema changes and any long-running PHP worker
restart must be handled separately when a release requires them. The HTTP health
checks do not verify every application feature.

## Simulation from the setup branch

A push to `codex/github-deploy` runs the same workflow using the repository SSH
Secrets in dry-run mode. Files are uploaded only to a private temporary staging
directory outside the web root; production rsync uses `--dry-run`, and no backup
directory is created. The staged PHP/dependencies are checked with the production
runtime, and the existing login pages are checked. Temporary staging files are
removed at the end. This validates the Secrets and proposed synchronization
before merging the PRs.

Pushes to `main` publish code. The runner script rejects publication from other
branches and defaults to simulation when no mode is provided. Manual runs on
`main` publish; runs on `codex/github-deploy` simulate. Dry-run HTTP checks examine
the currently deployed applications, not the staged application behavior.

## Destination and cleanup protection

Before opening the shared lock, and again after waiting for it and checking PHP,
the deployment validator checks the exact allowlisted destination for this
repository. Destination path components must be real directories; aliases,
symlinks, ancestor aliases, special entries, hard-linked target files, and
file/directory type conflicts stop publication before production files change.
New backup paths are also validated and existing backup directories are never
reused. Missing application directories are not created automatically.

Staging must be a private directory owned by the deploying user under the fixed
temporary root, with the expected random name and repository marker. Cleanup
uses Python's symlink-safe directory removal after checking that boundary; it
does not accept arbitrary server paths. The marker and validator are excluded
from publication. Python 3 with symlink-safe rmtree support is required.

The synchronization has no delete option. It updates or adds files with backups
of overwritten files and preserves files present only on the server. These
checks reduce the impact of path mistakes; they do not establish the cause of
the earlier incident or replace a complete backup. The SSH account still has
root privileges; account isolation should be addressed separately.

## Verifying this safety correction

Run `python3 tests/test_deploy_safety.py` locally. The workflow also requires the
`safety-checks` job to pass on Ubuntu before the deployment job starts. The tests
use temporary directories only; they do not connect to the VPS.

Push this correction to `codex/guard-deploy-paths` to run the guarded workflow
against the VPS in dry-run mode. This branch can never select publication mode.
Review that simulation and its protected paths before merging into `main`.
Changes to `main` remain real deployments after the prerequisite tests pass.
Do not treat local success as confirmation of the VPS Python/runtime checks.
