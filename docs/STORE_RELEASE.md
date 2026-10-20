# Releasing SignSphere on Google Play

The code side is ready: signed App Bundle (.aab) builds, versioning, no Android backups of
recordings, and the features Play requires (privacy notice, in-app login deletion). What's
left needs **your Play Console account**.

**Before a store build:** the app must be connected to a backend. SignSphere uses **Supabase**:
the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, and
`supabase/migrations/0001`–`0004` have been run. (The built-in server with `VITE_API_URL` also works — [DEPLOY.md](DEPLOY.md).)

**Ready-made store graphics** are in [`docs/play-store/`](play-store/): `icon-512.png`, `feature-graphic.png`
(1024×500) and six 1080×1920 phone screenshots.

| Link | Address |
|---|---|
| Privacy policy | `https://akhilabellam0108-ui.github.io/SighSphere/privacy/` (or your domain) |
| Terms of Use | `https://akhilabellam0108-ui.github.io/SighSphere/terms/` |
| Delete login (in app) | Accounts → Delete my login |
| Delete login (web) | Same screen on the website |

## 1. One-time setup

1. **Play Console** — <https://play.google.com/console>, one-time US$25. Organisation account
   if you have a company (D-U-N-S number). New personal accounts must run a **closed test with
   12+ testers for 14 days** before production — Deaf schools/NGOs you work with are ideal testers.
2. **Upload key** (keep the file and passwords safe):
   ```bash
   keytool -genkeypair -v -keystore signsphere-upload.jks -alias signsphere -keyalg RSA -keysize 4096 -validity 10000
   base64 -w0 signsphere-upload.jks > signsphere-upload.jks.b64     # macOS: base64 -i signsphere-upload.jks
   ```
3. **GitHub secrets:** `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS` (`signsphere`), `ANDROID_KEY_PASSWORD`.
4. **Create the app** in Play Console: *SignSphere*, English (India), App, Free. Keep **Play App Signing** on.

## 2. Build and upload

Actions → **Android release (Play Store)** → Run workflow (track `none` the first time) →
download the `SignSphere-aab` artifact → upload it to **Testing → Internal testing**.
For automatic uploads later, add a Play service-account key as `PLAY_SERVICE_ACCOUNT_JSON`
and pick a track when running the workflow. Version codes go up automatically.

## 3. App content answers

| Section | Answer |
|---|---|
| Privacy policy | the URL above |
| App access | Most features work without signing in. For login features give a test account. |
| Ads | No |
| Content rating | Communication / Education; no user-to-user public content → Everyone |
| Target audience | **13 and over** to start. (Including under-13s brings Google's Families policy; plan that with parental consent before opening to children.) |
| Health declaration | Not a health app. Emergency phrase cards are a communication aid, not a medical service. |
| **Data safety** | see below |
| **Account deletion** | In-app: Accounts → Delete my login. Deletes the login, its accounts, history and synced signs. |
| Permissions | Camera (sign recognition, processed on the phone), microphone (voice → sign), location (only when you tap "Attach my location" to an SOS text) |

**Data safety form**

| Data | Collected? | Notes |
|---|---|---|
| Email address | Yes, if you create a login | Account management |
| Name / organisation details | Yes, for hospital and organisation accounts | Account management, verification |
| App activity: history of signed/typed/spoken text | Yes, when signed in | App functionality; deletable |
| Recorded signs (hand landmarks, **not video**) | Yes, when signed in and synced | App functionality; deletable |
| Camera images / video | **No** — processed on the device, never uploaded | |
| Audio | **No** — speech recognition by the phone's system service | |
| Precise location | **No** — only placed into an SMS you send yourself | |
| Contacts | **No** — emergency contacts stay on the phone | |
| Crash logs / diagnostics | Yes — error message, screen, app version, device type | App functionality (fixing bugs). **Not linked to the user**: no email, login id, words or recordings |
| Terms acceptance | Yes — version and date, stored with the login | Account management |

Data encrypted in transit: **Yes**. Users can request deletion: **Yes**. No data is sold or used for ads.

## 4. Store listing

- **Name:** SignSphere — ISL Communication
- **Short description (≤80):** Indian Sign Language to text and voice — works even with no internet.
- **Full description:**

  > SignSphere helps Deaf and hearing people talk to each other in Indian Sign Language (ISL).
  >
  > • **Sign → text and voice:** sign to the camera and SignSphere writes and speaks it.
  > • **Text and voice → sign:** a 3D avatar signs what you type or say.
  > • **Sign for help (SOS):** set up emergency signs once; in an emergency, sign them and
  >   SignSphere shows a big message, says it aloud and lets you call or text in one tap —
  >   **with no internet**.
  > • **Live Conversation:** a Deaf and a hearing person take turns on one phone — signs become speech, speech becomes ISL.
  > • **Emergency cards** in English, Hindi and Telugu for hospitals, police and strangers, and texts to your contacts with your location.
  > • **Learn ISL** with practice and feedback. Real ISL signs from the INCLUDE dataset (AI4Bharat) are built in.
  > • **English, हिन्दी, తెలుగు** interface.
  > • **For hospitals and organisations:** separate verified accounts.
  > • **Private:** the camera is processed on your phone; video never leaves it.
  >
  > SignSphere is a communication aid, not a replacement for a qualified ISL interpreter.

- **Category:** Communication. **Tags:** sign language, accessibility, deaf.
- **Graphics:** `docs/play-store/icon-512.png`, `docs/play-store/feature-graphic.png`, and the six screenshots in `docs/play-store/`.
  Replace them later with photos of a consenting Deaf signer using the app — real people make a stronger listing.
- **Translated listings** (Play Console → Store presence → Main store listing → Manage translations): add Hindi (hi-IN) and Telugu (te-IN):

  | | Hindi | Telugu |
  |---|---|---|
  | Short description | भारतीय सांकेतिक भाषा से लिखित और आवाज़ — बिना इंटरनेट भी चलता है। | భారతీయ సంజ్ఞా భాష నుంచి అక్షరాలు, మాట — ఇంటర్నెట్ లేకున్నా పనిచేస్తుంది. |
  | Full description (first line) | साइनस्फ़ियर बधिर और सुनने वाले लोगों को भारतीय सांकेतिक भाषा में एक-दूसरे से बात करने में मदद करता है। | సైన్‌స్ఫియర్ బధిరులు, వినగలిగేవారు భారతీయ సంజ్ఞా భాషలో ఒకరితో ఒకరు మాట్లాడుకోవడానికి సహాయపడుతుంది. |

  Have a native speaker check these before publishing.

## 5. Release

Internal testing → closed testing (12 testers × 14 days if required) → production with a
staged rollout. Every upload needs a higher version code; the workflow handles it.

## Checklist

- [x] Backend connected (Supabase variables set, migrations 0001–0004 run)
- [x] Privacy and Terms pages online with real addresses; consent at sign-up; in-app login deletion
- [x] Store graphics ready (`docs/play-store/`)
- [ ] Support email set (`VITE_SUPPORT_EMAIL` repository variable) — Play shows it on the listing
- [ ] Emergency numbers verified with local services and a Deaf advisor (see `Emergency.tsx`)
- [ ] Play Console account, upload key and secrets
- [ ] App content forms and data safety filled in as above
- [ ] Closed test with Deaf users, feedback addressed
