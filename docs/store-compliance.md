# Store compliance mapping — Big Pickle Racing Tracker (v4.14)

Last updated: 2026-10-19. Source guidelines research: `~/workspace/research_notes/app-store-play-guidelines-scan-2026-20261020-0338/report.md`.

The app is currently a web app (PWA) distributed via GitHub Pages — NOT in either store,
so store review does not currently apply. This document maps every finding from the
guidelines scan so a future store submission (TWA on Google Play, wrapper on App Store)
can be prepared without rediscovering them.

## Google Play

### Target API level (DONE via process, not code)
- Requirement: new apps AND updates must target **Android 16 / API 36** since 2026-08-31.
- TWA note: the wrapper tooling (Bubblewrap) sets targetSdk — there is no app-side
  change to make. Just verify Bubblewrap ≥ the API-36 release when packaging.

### Privacy policy (DONE in-app)
- Requirement: every app must have a privacy policy, linked in Play Console AND in-app.
- Implementation: `public/privacy.html` (deployed at the same base URL, path `privacy.html`),
  linked from Settings → About & legal. Contact route: repo issues page (swap in an email
  address if one is ever published for the team).

### Data safety form (PREPARED — filled in Play Console at submission time)
- Data stored **only on-device** (runs, tracks, settings, PIN hashes, sync token) is NOT
  "collected" per Google's definition.
- **Collected** (transmitted off-device): team run/track/racer data synced to the crew's
  own GitHub repository when the user enables team sync. Purpose: **App functionality**.
- NOT "shared": the transfer is user-initiated to the user's own team folder, which Google
  explicitly excludes (like sharing a document the user chose to share).
- Location: sent to Open-Meteo for a single weather request, ephemeral, not stored —
  not "collected" (same exception as Google's weather-app example). On-device location
  permission remains a foreground-only, user-confirmed (window.confirm) request.
- Google Fonts (fonts.googleapis.com/fonts.gstatic.com): SDK-level declaration; the app
  loads stylesheets from Google, which receives the device IP at page load.

### UGC — closed-group tier (DONE in-app)
- Requirement: closed-team UGC still needs in-app report functionality.
- Implementation: every role can **Flag** a run for review (RunCard → Flag button; `flagged`
  field); the flag syncs through the sheet's "Flagged" column so the whole crew sees it.
  Admin can unflag or delete. Team terms on the privacy page set expectations. Track notes
  are device-local only (not shared UGC).

### Permissions (PASSING)
- Geolocation: foreground-only, user-confirmed at point of use, fallback when a track
  lacks saved coordinates. No background location. No contacts/camera/microphone.

### Account deletion (NOT TRIGGERED)
- No server accounts exist (per-role PINs unlock the local device only). Answer the Data
  safety deletion questions at submission time with on-device deletion ("Clear all data"
  in Settings wipes the device copy).

### Play Protect (VERIFIED)
- Play Protect scans packaging-agnostically; a TWA is treated like any native app. There
  is no web-vs-native exemption, and nothing in the code can influence a Play Protect
  verdict — it is an OS-level decision.

### 12-tester closed test / developer verification (AT SUBMISSION)
- Console-side processes, not code. Required when submitting; noted here so they aren't
  rediscovered.

## Apple App Store

### Guideline 4.2 — rejection risk (POSITION, inherent to distribution)
- A bare WKWebView wrap of this web app is exactly what 4.2 targets ("elevate it beyond
  a repackaged website"). There is no exemption for small-team utilities.
- Current distribution (installed PWA via browser) is OUTSIDE App Store review entirely —
  4.2 does not apply today.
- If ever submitting: the mitigation is genuine app-like capability, which the app has
  (installable, offline service worker with cached fallback, file import/export,
  on-device geolocation, share features). A wrapper submission should document these
  and expect reviewer discretion. Not code-fixable beyond what the app already does.

### Privacy policy link (DONE in-app)
- Requirement: privacy policy for ALL apps, in App Store Connect metadata AND in-app.
- Implementation: same `privacy.html`, linked from Settings → About & legal.

### App privacy nutrition labels (PREPARED)
- Local-only data: "Data Not Collected" achievable.
- Ephemeral weather fetch: need not be disclosed.
- Team sync: disclose **User Content → Other User Content** collected for App
  functionality, not shared with third parties (GitHub is the team's own storage,
  user-initiated).

### Privacy manifests / required-reason APIs (N/A)
- Applies to wrappers/SDKs at submission; no SDKs or tracking in the app.

### Guideline 1.2 UGC (DONE in-app)
- Same implementation as Play: flag/report on shared runs, admin removal, published
  team terms. No private-team carve-out in the guideline text, so this is implemented
  regardless of crew size.

### Sign in with Apple (NOT TRIGGERED)
- No third-party/social login exists. If a GitHub sign-in is ever added purely for repo
  sync, treat it as the "client for a specific third-party service" exception vs.
  primary-account login — a judgment call at that time.

### Location (5.1.5) — PASSING
- Used only when directly relevant (weather for a track), with explicit consent.

### Weather data (5.2.2 / 5.2.5) — PASSING
- Open-Meteo use is permitted under its terms; attribution requirements met (source
  link present in-app). Apple WeatherKit not used.
