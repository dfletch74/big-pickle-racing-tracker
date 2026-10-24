# GitHub Token Setup & Revoke Runbook

The tracker app publishes team data to this repo using a fine-grained
personal access token (PAT) saved on each device (Settings → Team data).
The token is stored only in that device's browser localStorage — never in
the repo, never on a server.

**Use one token per device.** That way losing a device (or removing someone
from the crew) means revoking one token, not breaking everyone.

## Recommended setup

| Device / person | Token name suggestion | Needed? |
|---|---|---|
| Dwayne's iPhone | `big-pickle-tracker-dwayne-iphone` | Yes — publishes runs |
| Dwayne's iPad | `big-pickle-tracker-dwayne-ipad` | Yes — publishes runs |
| Dean's Android | `big-pickle-tracker-dean-android` | Yes — publishes runs |
| Ethan's phone | `big-pickle-tracker-ethan-phone` | Yes, if he logs runs |
| Hughie / Grog (viewers) | — | No — viewers can't log runs, nothing to publish |

## Mint a token (per device)

1. On any computer, go to github.com → avatar → **Settings**.
2. **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
   → **Generate new token**.
3. Token name: `big-pickle-tracker-<person>-<device>` (see table above).
4. Expiration: 1 year (set a calendar reminder) or No expiration.
5. Repository access: **Only select repositories** → `big-pickle-racing-tracker`.
6. Permissions → **Contents**: **Read and write**. Nothing else.
7. **Generate token**, copy it immediately (it won't be shown again).

## Put the token on the device

1. Open the tracker app on that device → Settings → Team data.
2. Paste the token in the GitHub token box → Save.
3. Tap **Sync now** — a successful publish confirms the token works.

(Alternative: paste the new token into your own phone's token box, use
**Share** to QR it to the crew member's phone, then put your own token back.
Or just text them the token string to paste in themselves.)

## Revoke a token (device lost, or someone leaves the crew)

1. github.com → avatar → **Settings** → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens**.
2. Find the token by name (this is why per-device names matter).
3. Click it → **Delete**. Confirm.

That device immediately loses publish access; every other device keeps
working. The app itself keeps working on the revoked device — it just
can't push to the sheet until a new token is saved.

## Notes

- The token can only read/write this one repo's contents. It cannot touch
  your other repos, settings, or account.
- If you suspect a token was abused, check the repo's commit history for
  unexpected "Team users sync via app" / "Team runs sync" commits.
- Keep your own list of which token name is on which device — GitHub shows
  the "last used" date per token, which helps identify a stale one.
