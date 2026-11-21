# Nookscanner Privacy Policy

Effective date: 20 November 2026

This policy explains what personal data Nookscanner collects, why, where it is kept and what
choices you have. It covers the Nookscanner Capture app for iPhone, the Nookscanner web dashboard
and the guest tour that opens from a QR code.

Nookscanner is provided by [COMPANY LEGAL NAME], [COMPANY ADDRESS] ("we", "us").
Contact: [CONTACT EMAIL].

## Who uses Nookscanner

- **Managers and their teams** (property managers, hosts and their staff) sign in to the
  dashboard and the Capture app with an account. They record walkthrough videos of apartments,
  which are turned into 3D tours with appliance guides.
- **Guests** (people staying in an apartment) open the tour by scanning a QR code. Guests do not
  create an account.

The organization that records an apartment controls that apartment's data (recordings, rooms,
appliance guides). We process it on the organization's behalf to provide the service.

## What we collect

### Account data (managers and team members)

- Email address and password (the password is handled by our authentication provider and is
  never stored in readable form).
- Name, if you add one to your profile, and your language preference (English or Arabic).
- Your organizations, your role in each (for example owner, admin, manager, viewer) and
  invitations you send or accept.
- A session token that keeps you signed in: stored in a cookie on the dashboard, and in the
  iPhone Keychain in the Capture app.

### Property and apartment data

- Properties, apartments (name, unit number, layout), rooms and their order, appliances and
  their instructions, and the QR codes created for each apartment.

### Recordings and 3D scenes

- Walkthrough videos you record in the Capture app or upload in the dashboard.
- Information about each recording: per-room start and end times, quality measurements (for
  example blur and brightness), and the capture settings used (resolution, frame rate, codec,
  lens).
- Technical device details for each recording: platform, device model, operating system version
  and app version. These help us check that the video is good enough for a 3D scene.
- 3D scenes and quality reports produced from the videos.

**Recordings show the inside of a home.** They can capture furniture, personal belongings,
documents or people. Before recording, managers must make sure they have the right to film the
property, remove personal items and documents where possible, and avoid filming people. Before a
3D tour is published, the manager must confirm it shows no personal information. Guests are never
filmed by Nookscanner.

### Location

The Capture app does not ask for or collect your location. Recordings are stored without GPS
data.

### Guests

Guests do not create an account and we do not ask for their name or contact details. When a guest
opens a tour, the QR code's link identifies the apartment, not the person. We do not store guests'
IP addresses or precise location. Abuse protection may use a short-lived, salted hash of the IP
address that is kept in memory only and never saved.

### Records of important actions

We keep an audit log of security-relevant actions (for example sign-in related changes, member
and role changes, publishing a tour) to protect accounts and investigate problems.

## What we do not do

- No advertising, and no selling or renting of personal data.
- No tracking across other companies' apps or websites.
- No location tracking.

## Why we use the data

- To provide the service: accounts, organizations, recording and uploading walkthroughs,
  building 3D tours, and showing tours and appliance guides to guests.
- To keep the service secure: access control, preventing abuse, and audit records.
- To check and improve the quality of recordings and 3D scenes.
- To contact you about your account or the service.

Where data protection law requires a legal basis, we rely on performing our contract with your
organization, our legitimate interest in keeping the service secure and working, and your
consent where we ask for it. [LEGAL BASIS AND APPLICABLE LAW TO BE CONFIRMED BY COUNSEL]

## Who processes the data for us

We use these service providers, only to run Nookscanner:

| Provider | What it does |
| --- | --- |
| Supabase | Database, sign-in and file storage (accounts, apartment data, recordings, 3D scenes) |
| Modal | Computers that turn walkthrough videos into 3D scenes |
| Vercel | Hosting for the dashboard and the guest tour website |

Data is stored in the Supabase region [DATA REGION]. Recordings are kept in private storage that
only signed-in members of the owning organization (and our processing system) can access.
Published 3D tours can be viewed by anyone who has the apartment's QR link.

## How long we keep data

- **Raw walkthrough videos:** deleted 90 days after the 3D scene is approved (an organization may
  set a different period). [Automatic deletion is being built; until then videos are deleted on
  request.]
- **3D scenes:** kept while the apartment exists in Nookscanner.
- **Account data:** kept while your account exists.
- **Audit logs:** kept for 1 year, then deleted.
- When an organization is deleted, its database records are deleted with it and its stored
  files are removed.

## Security

- All connections use encryption in transit (HTTPS/TLS).
- Every database table is protected by row-level security, so members only see the data of
  organizations they belong to.
- Storage is private; files are shared only through short-lived signed links.
- Sessions can be ended by signing out, which revokes the session.

No system is perfectly secure, but we work to protect your data and will notify you as required
by law if a breach affects you.

## Your rights and choices

You can:

- see and correct your profile information in the dashboard;
- ask for a copy of your personal data;
- delete your account and personal data. [In-app and web account deletion are being added; until
  then, email [CONTACT EMAIL] and we will delete your account within 30 days.] If you are the only
  owner of an organization, you must first transfer ownership or delete the organization;
- object to or restrict some uses of your data, where the law gives you that right.

Guests who want information removed from a tour should contact the property manager, or us at
[CONTACT EMAIL].

To use these rights, email [CONTACT EMAIL]. You may also complain to your data protection
authority.

## Children

Nookscanner is a business tool for property managers. It is not directed at children, and we do
not knowingly collect personal data from children.

## Changes to this policy

We will update this page when our practices change and change the effective date above. If a
change is significant, we will tell account holders by email or in the app.

## Contact

[COMPANY LEGAL NAME], [COMPANY ADDRESS]
Email: [CONTACT EMAIL]

---

## App Store privacy label (internal)

Not part of the public policy. Answers for App Store Connect "App Privacy", based on the code as of
2026-11-21. Re-check the dependency list before each submission.

Tracking: **No** data is used for tracking.

| Apple data type | Collected | Linked to the user | Used for tracking | Purposes |
| --- | --- | --- | --- | --- |
| Contact Info > Email Address | Yes | Yes | No | App Functionality |
| Contact Info > Name | Yes (optional profile name) | Yes | No | App Functionality |
| User Content > Photos or Videos | Yes (walkthrough videos, 3D scenes) | Yes | No | App Functionality |
| User Content > Other User Content | Yes (apartment, room and appliance details) | Yes | No | App Functionality |
| Identifiers > User ID | Yes (account ID) | Yes | No | App Functionality |
| Diagnostics > Other Diagnostic Data | Yes (device model, OS and app version, capture quality metrics per recording) | Yes | No | App Functionality |
| Location | No | | | |
| Contacts, Health, Financial, Browsing/Search History, Purchases, Usage Data, Sensitive Info | No | | | |

- Diagnostics > Crash Data: only if crash reporting (Sentry) is added later; currently **No**.
- Purchases: only if in-app subscriptions are added; then Purchases > Purchase History, linked,
  App Functionality.
- Data deletion: available on request now; in-app deletion is required before submission
  (docs/APP_STORE_COMPLIANCE.md S3).
