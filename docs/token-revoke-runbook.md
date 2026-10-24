# GitHub Token Revoke Runbook

The tracker app publishes team data to this repo using a fine-grained
personal access token (PAT) saved on each device (Settings → Team data).
The token is stored only in that device's browser localStorage — never in
the repo, never on a server.

If a device is lost, stolen, or you simply want to rotate the token,
revoke it so that device can no longer publish.

## Revoke a token (2 minutes)

1. On any computer, go to github.com → click your avatar → **Settings**.
2. Left sidebar → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens**.
3. Find the token used for the tracker (check the name / last-used date).
4. Click it → **Delete** (or **Revoke**). Confirm.

That device immediately loses publish access. The app keeps working —
it just can't push to the sheet until a new token is saved.

## Issue a replacement token

1. Same page → **Generate new token**.
2. Token name: something like `big-pickle-tracker-<device>` (e.g. `big-pickle-tracker-iphone`).
3. Expiration: 1 year (set a calendar reminder) or No expiration.
4. Repository access: **Only select repositories** → `big-pickle-racing-tracker`.
5. Permissions → **Contents**: **Read and write**. Nothing else.
6. **Generate token**, copy it.

## Put the new token on the device

1. Open the tracker app on the device → Settings → Team data.
2. Paste the token in the GitHub token box → Save.
3. Tap **Sync now** to confirm publishing works.

## Notes

- Each device should have its **own** token (name it per device). That way
  revoking one doesn't break the others.
- The token can only read/write this one repo's contents. It cannot touch
  your other repos, settings, or account.
- If you suspect the token was abused, check the repo's commit history
  for unexpected "Team users sync via app" / "Team runs sync" commits.
