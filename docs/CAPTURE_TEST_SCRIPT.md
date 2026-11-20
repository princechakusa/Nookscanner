# Nookscanner Capture: manual device test script (Stage 5.4)

Run this on the **pilot iPhone 16 Pro Max** and on **at least one other iPhone tier** (an older or non-Pro iPhone). Record the results in the table at the end and share them (text only; never commit footage).

## 1. Build and install (once per device, about 20 minutes)
Prerequisites: your Expo account is signed in through your `EXPO_TOKEN` environment variable, and the iOS credentials are set up (both done on 2026-11-20).
1. Register each test iPhone for internal builds (opens a link/QR to install a profile on the phone):
   `cd apps/nookscanner` then `npx eas-cli device:create`
2. Start a development build in Expo's cloud (uses the free build quota; no purchase):
   `npx eas-cli build --profile development --platform ios`
3. When it finishes, open the build link on each iPhone and install it.
4. On your computer start the bundler: `npx expo start --dev-client` (same Wi-Fi as the phone), then open Nookscanner on the phone and scan the QR code shown in the terminal.

## 2. Preparation in the dashboard (hosted project)
1. Sign in to the dashboard with your manager account (hosted Auth must allow sign-in; see Blocked on user 2).
2. Create an organization, a property and an apartment with its real layout; open the apartment and press **Create these rooms**. Put the rooms in walking order with Up/Down.

## 3. Test steps (expected result in brackets)
| # | Step | Expected |
|---|---|---|
| 1 | Open the app, sign in with a wrong password, then the right one | Clear error, then the apartment list |
| 2 | Choose the apartment | Plan shows rooms in your order, doorway steps between them and "walk back" at the end |
| 3 | Start capture; allow camera access | Live camera; panel shows resolution, fps, codec and tier (pilot iPhone: 3840x2160, 30 fps, HEVC, T1) |
| 4 | Hold the phone sideways; press Start recording | "exposure locked" appears after about 1.5 s |
| 5 | Walk the first room, press **Room done**; repeat for every room | Room counter advances; "Next: walk slowly through the doorway..." hint |
| 6 | Press Pause in the middle of a room, wait 10 s, press Resume | PAUSED shown; recording continues |
| 7 | In one room press Room done after less than 5 s | Review later warns that this room is "probably too short" |
| 8 | Walk back to the start, press Finish | Review screen with per-room start/end times |
| 9 | Press **Record again**, then make a full recording and press **Use this recording** | "Capture saved" |
| 10 | In the dashboard database (Supabase Table editor, `scan_sessions`) open the newest row | `device_info` shows device model, OS, resolution, fps, codec, lens, exposure mode, duration, pauses; no location; `scan_checkpoints` has one row per room with start/end ms |
| 11 | Sign out and back in; force-close and reopen the app | Session restored after reopen; sign-out returns to sign-in |
| 12 | Repeat 3-9 on the second iPhone | Tier and resolution follow that phone's camera (for example T2/T3, 1080p or 4K) |

Uploading the recording from the app comes in Stage 5.6. Until then, export the video from Photos and upload it in the dashboard (apartment > Upload a walkthrough video).

## 4. Results to send back
| Device (model, iOS) | Tier shown | Resolution / fps / codec | Steps passed | Problems (step number + what happened) |
|---|---|---|---|---|
| | | | | |
