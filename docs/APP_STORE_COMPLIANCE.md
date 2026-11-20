# Nookscanner: App Store and Google Play Compliance

Version 1.0 (2026-11-20). Requirement set by the user: the native apps must pass Apple App Review and Google Play review the first time. This document maps each store rule that applies to Nookscanner to what the product does, its status, and the exact work left. It is a checklist for Phase 13 (store submission) and is reviewed whenever an app feature changes.

**Which apps go to stores:** only **Nookscanner Capture** (`apps/nookscanner`, the managers' scanning app): iOS first, Android later (ADR-005). The **guest experience is a website** opened from a QR code (no app, no store), and the **manager dashboard is a website**; neither needs store review, but both share the privacy policy, terms and account-deletion flow below.

**Rules change.** Items marked _(verify at submission)_ depend on yearly deadlines. Re-check them against the official pages listed in section 6 on the day of submission and record the date in the submission log (section 5).

Status legend: **DONE** (implemented and tested), **GAP** (work for us, scheduled), **USER** (needs the account owner), **N/A** (does not apply, with the reason).

## 1. Shared requirements (both stores)

| # | Requirement | Applies because | Status | Work / evidence |
|---|---|---|---|---|
| S1 | **Privacy policy** at a public URL, linked in the store listing and inside the app (sign-in screen and settings) | The app handles personal data (manager email/name) and interior video of homes | GAP | Write policy (data collected, purpose, retention: raw footage 90 days after approval, processors: Supabase, Modal, Vercel; no ads, no tracking); host on the dashboard domain (`/legal/privacy`); link in app. Legal text reviewed by the user's counsel (USER) |
| S2 | **Terms of use** URL | B2B service with accounts | GAP | Same as S1 (`/legal/terms`) |
| S3 | **Account deletion inside the app** (Apple 5.1.1(v); Google Play account deletion policy) | Members have accounts | GAP (roadmap 10.6) | "Delete my account" in app settings → confirmation → deletes the Supabase auth user and profile; organizations the user solely owns must be transferred or deleted first (LAST_OWNER rule) with a clear message. Must not require contacting support or a phone call |
| S4 | **Account deletion from the web** (Google requires a URL that works without the app) | Google Play data deletion policy | GAP (roadmap 10.6) | Public page `/account/delete` on the dashboard: sign in → delete; URL entered in Play Console "Data deletion" |
| S5 | **Reviewer access**: working test credentials and data | The app is login-only (B2B) | GAP (Phase 13) | Dedicated reviewer account in a "App Review" organization with a published demo apartment and rooms, so every screen is reachable; credentials only in App Store Connect / Play Console "App access" notes, never in the repo; rotate after review |
| S6 | **No placeholder or test content** in the submitted build; no "beta"/"demo" labels; every button works | Apple 2.1 / 2.3, Google "broken functionality" | GAP | Release checklist item; the guest `/demo` page is web-only and never in the app |
| S7 | **Accurate data-collection declarations** (Apple App Privacy labels; Google Data safety form) | Both stores | GAP (Phase 13) | Declare: Contact info (email, name: account management), User content (videos, photos: app functionality), Identifiers (user ID: app functionality), Diagnostics (crash data via Sentry, if enabled). Not used for tracking or advertising. Encrypted in transit: yes. Deletion request: yes (S3/S4). Must match the privacy policy and actual SDKs (re-check the dependency list before submission) |
| S8 | **Permissions only when needed, with clear reasons** | Camera (and optionally microphone) | DONE (iOS strings) / GAP (Android) | iOS: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` in `app.json`. Request at the moment of capture, not at launch. Android: `CAMERA` only; no `RECORD_AUDIO` unless audio notes ship |
| S9 | **No location data** | Homes are private; quality bar + SECURITY privacy rules | DONE | `scan_sessions.device_info` rejects location keys (DB constraint); app never requests location. Declare "no location" in both forms |
| S10 | **Consent and privacy of people in footage** | Interior video may show residents' belongings or people | GAP | In-app capture checklist step: "Make sure no people or personal items are visible"; pre-publish confirmation exists in the manager review (artefact `personal_items`, Stage 6.3); mention in the privacy policy |
| S11 | **Payments**: no purchases inside the app | B2B service billed outside the app (if billing is added) | DONE (by design) | The app sells nothing, shows no prices and no links or buttons to buy elsewhere (Apple 3.1.1 / 3.1.3(b) multiplatform; Google Payments policy). Keep it that way |
| S12 | **Age / content rating** questionnaire | Required in both consoles | USER (Phase 13) | Answer honestly: no objectionable content, no user-to-user communication, no gambling, no web browsing → expected lowest rating |
| S13 | **Stable, crash-free build** tested on real devices | Apple 2.1, Google pre-launch report | GAP (Phase 5.4 device runs, Phase 11) | TestFlight / internal testing on the registered test iPhones (USER runs builds; see `CAPTURE_TEST_SCRIPT.md`) |
| S14 | **Contact and support URL**, app description that matches what the app does | Store listing rules | USER + GAP | Support page `/support` on the dashboard domain; listing copy drafted in Phase 13 |
| S15 | **Intellectual property**: own name, icon and screenshots | Apple 5.2, Google IP policy | USER | Trademark search for "Nookscanner" (KI-007) before submission; real screenshots of the actual app (no mockups) |

## 2. Apple App Store (iOS) specifics

| # | Requirement | Status | Work / evidence |
|---|---|---|---|
| A1 | Apple Developer Program membership, bundle id `com.nookscanner.capture`, signing | DONE | Team N5DSK22C62; credentials ready in EAS (PROJECT_MASTER) |
| A2 | Built with the **current required Xcode / iOS SDK** _(verify at submission: from 2026-04-28 Apple requires apps built with the iOS 26 SDK / Xcode 26)_ | GAP (Phase 13) | EAS Build image with the required Xcode; Expo SDK 58 targets it. Check on submission day |
| A3 | **Privacy manifest** (`PrivacyInfo.xcprivacy`) incl. required-reason APIs for the app and every SDK | GAP | Expo generates manifests for its own modules; add `ios.privacyManifests` in `app.json` for app-level declarations (UserDefaults, file timestamps, disk space as used by expo-file-system), and confirm third-party SDKs (VisionCamera, Supabase JS) need none or ship their own. Validate the generated archive before upload |
| A4 | **Export compliance**: HTTPS/TLS only (exempt encryption) | DONE | `ios.config.usesNonExemptEncryption: false` in `app.json` (sets `ITSAppUsesNonExemptEncryption`), so App Store Connect does not ask on every build |
| A5 | **Background behaviour** (2.5.4: background services only for their intended purpose) | DONE (design) | Uploads use iOS background URL sessions (expo-file-system `sessionType: 'background'`), which need no `UIBackgroundModes`. Do **not** add `audio`, `location` or `fetch` background modes |
| A6 | **Sign in with Apple** (4.8) | N/A | Required only when offering third-party/social sign-in. Nookscanner uses its own email + password. If Google/other social login is ever added, Sign in with Apple must be added too |
| A7 | **Minimum functionality** (4.2) | DONE (design) | A native camera capture tool with guided checkpoints, live quality feedback and resumable uploads (not a wrapped website) |
| A8 | **App Review notes** | GAP (Phase 13) | Explain: B2B tool for property managers; how to sign in (S5); what to scan (any room works); that 3D processing runs in the cloud and results appear in the web dashboard |
| A9 | **Distribution choice** | USER decision | Option 1: public App Store (full review). Option 2: **Custom App via Apple Business Manager** (private to client organizations, still reviewed but the B2B context is clear). Recommended for the pilot: TestFlight (internal/external testers), then decide |
| A10 | Store assets: 1024 px icon, iPhone 6.9" screenshots, description, keywords, support + privacy URLs, age rating | USER + GAP | Real screenshots from a real capture (S15) |
| A11 | iPad | N/A | `supportsTablet: false`; the app is iPhone-only (screenshots for iPad not required) |
| A12 | Accessibility (Accessibility Nutrition Labels, optional) | GAP (Phase 11) | VoiceOver labels on capture controls; Dynamic Type for text; declare honestly if the label is filled |

## 3. Google Play (Android) specifics (when Android capture ships, Phase 14)

| # | Requirement | Status | Work / evidence |
|---|---|---|---|
| G1 | **Target API level** _(verify at submission: new apps and updates must target an API level within one year of the latest Android release; for submissions after 2026-08-31 that is API 36 / Android 16)_ | GAP | Expo SDK at submission time sets `targetSdkVersion`; confirm in the built AAB |
| G2 | **App Bundle (AAB) + Play App Signing**, 64-bit | GAP | EAS Build produces AAB; enrol in Play App Signing |
| G3 | **Data safety form** matching S7 | GAP | Same answers as Apple labels; include the deletion URL (S4) |
| G4 | **Testing requirement for new personal developer accounts** _(verify)_: a closed test with at least 12 testers for at least 14 continuous days before production access | USER | Applies if the Play developer account is a personal account created after 2023-11-13. An organization account (D-U-N-S) avoids it |
| G5 | **Foreground service declaration** for uploads that continue in the background (Android 14+ requires a foreground service type and a Play Console declaration) | GAP | Use `dataSync` type with a visible progress notification, or WorkManager-based upload; declare in Play Console with a video of the feature |
| G6 | **Photo and video permissions policy** | DONE (design) | The app records with the camera; it does not read the gallery. Do **not** request `READ_MEDIA_VIDEO`/`READ_MEDIA_IMAGES`; uploading existing videos happens in the web dashboard (or via the system Photo Picker, which needs no permission) |
| G7 | `POST_NOTIFICATIONS` (Android 13+) only if upload notifications are shown | GAP | Ask at the moment the first background upload starts |
| G8 | **App access** instructions (credentials) | GAP | Same as S5 |
| G9 | **Content rating** (IARC questionnaire), target audience (adults; not designed for children → Families policy N/A) | USER | Answer in Play Console |
| G10 | Store listing assets: 512 px icon, feature graphic 1024x500, phone screenshots, short/full description, privacy policy URL | USER + GAP | Real screenshots only |

## 4. Work added to the roadmap

- **10.6 Account and data deletion** (S3, S4): in-app and web deletion, owner-transfer guidance, deletion of personal data within 30 days, audit entry; E2E test. Required before any store submission.
- **13.x Store submission** (this document): privacy policy + terms + support pages (S1, S2, S14), reviewer organization and account (S5), privacy labels and Data safety (S7, G3), privacy manifest validation (A3), current SDK / target API checks (A2, G1), assets with real screenshots (A10, G10), submission and review log (section 5).
- Already done: A4 export-compliance flag, A5 background design, S8 iOS permission strings, S9 no location, S11 no purchases.

## 5. Submission log

Record every submission: date, store, build number, rules re-verified (with the date of the official page), reviewer notes used, outcome, and any rejection reason with the fix. Empty until Phase 13.

| Date | Store | Build | Rules verified on | Outcome | Notes |
|---|---|---|---|---|---|

## 6. Official sources (re-check before each submission)

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion requirement: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple privacy manifests and required-reason APIs: https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
- Apple App Privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Apple upcoming requirements (SDK minimums): https://developer.apple.com/news/upcoming-requirements/
- Google Play Developer Policy Center: https://support.google.com/googleplay/android-developer/topic/9858052
- Google Play account deletion requirement: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play target API level: https://developer.android.com/google/play/requirements/target-sdk
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play testing requirement for new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play foreground service declaration: https://support.google.com/googleplay/android-developer/answer/13392821
