# Data protection impact assessment: health information

The DPIA UK GDPR Art. 35 requires before processing special category data that's likely to be high risk. It covers the health information people can log under the Health Data Agreement, and builds on the record of processing in [data-protection.md](data-protection.md). Not legal advice. Part of #1064.

**Status:** approved by the controller, 18 October 2026.
**Review:** whenever a new kind of health information is added (#1409 cycle phase, #1410 energy and mood), the agreement's wording changes, or a control below changes. Both of those issues need this DPIA updated before they ship.

## Why a DPIA

Health information is special category data (Art. 9). The ICO lists processing special category data at scale, and tracking health through an app, among the things that need a DPIA. The scale here is small (one owner, demo accounts, a closed beta), but the app is built to grow, so the assessment is done now.

## The processing

| | |
|---|---|
| **What** | Pain and injury tags on a climb: limb, side, hold type, movement style, wall angle (`entry_pain_moves`). Planned: menstrual cycle phase, by phase only, never dates (#1409); energy and mood (#1410). |
| **Whose** | Account holders who agree to the Health Data Agreement: 16 or over, or with a parent or guardian's agreement (self-declared in the agreement statement). |
| **Purpose** | Finding patterns in the climber's own performance, shown only in their own Performance insights (the Injury insights report). Nothing else. |
| **Lawful basis** | Art. 6(1)(a) consent and Art. 9(2)(a) explicit consent, recorded in `consents` with the wording version and dates (`server/lib/health-consent.js`). |
| **Collection** | Only what the climber logs. Off until they agree; the rest of the app works the same without it. |
| **Where it's held** | The production database (D1), its backups (Time Travel, 7 days on the current plan), and a copy on each of the climber's devices for offline use. |
| **Who sees it** | The climber. A site administrator, for support and moderation, through the read-only, audit-logged admin logbook view (#1433). Never public profiles, never other users. |
| **Retention** | Until the climber withdraws consent (deleted at once, `handleWithdrawPainInjuryConsent`) or deletes their account. Out of backups within 30 days. Other devices drop it on their next sync. |
| **Processors** | Hosting and database provider, under its DPA with the UK–US data bridge and the UK Addendum as fallback (see [data-protection.md](data-protection.md#processors)). The app never sends health information to an email provider. |

## Necessity and proportionality

- **Necessary for the purpose.** Pattern-finding between climbing and pain needs the pain record itself. Nothing is collected that the reports don't use.
- **Minimised.** Pain is a structured tag, not free text. Cycle data will be phase only, never dates. No diagnosis, medication or medical history is asked for.
- **Opt-in, granular, revocable.** Consent is separate from the Terms of use, asked in onboarding or My account, and withdrawn in one step. A new agreement version that changes what's covered asks again (`needsConsentAgain`), and no new health data is stored until it's given.
- **Enforced on the server**, not just hidden in the UI: a write with pain tags and no consent in force is refused (`CONSENT_REQUIRED`).
- **Transparent.** The privacy notice's Health information section and the agreement itself say what's kept, why, who sees it and how to stop.
- **Rights.** Access and correction in the app; erasure by withdrawing consent or deleting the account. **Portability is a gap:** the export leaves out pain tags (`shared/csv-import.js`, `resolveExportRows`). Closed by the extended export schema (#915).

## Risks

Likelihood and severity are rated remote, possible or probable, and minimal, significant or severe, as in the ICO template. The residual rating is after the measures listed.

| # | Risk to people | Likelihood | Severity | Measures in place | Residual |
|---|---|---|---|---|---|
| 1 | Another user reads someone's health information through an access-control bug | Remote | Severe | Per-user isolation on every query; the authorisation matrix test covers every route, including a differential check for leaks (#1070); health data is never in public responses (tested) | Low |
| 2 | An attacker takes over an account and reads its health information | Possible | Significant | Hashed passwords; verified email; rate limits on sign-in; bot checks on sign-up; sessions expire. Optional Two-Factor Authentication (#1436): authenticator-app codes, encrypted backup codes, lockout after failed codes, and recovery that needs the password and the account's email, then waits 7 days with a warning email, with no admin reset; optional passkeys with the device check enforced (#1439) | Low with 2FA on; Medium without it, since it's the climber's choice |
| 3 | Someone with access to a shared or lost device reads the on-device copy | Possible | Significant | The copy is kept per account, so another login can't see it in the app; *Clear device data* in My account; the privacy notice explains both | Medium |
| 4 | An administrator looks without a reason | Remote | Significant | One administrator; access only behind Cloudflare Access on the admin host (ADR-0034); the logbook view is read-only and every look is audit-logged; the agreement says it's for support and moderation only | Low |
| 5 | A processor breach exposes the database | Remote | Severe | Processor DPA and security commitments; encryption at rest on the platform; the breach playbook covers the 72-hour ICO notification (`docs/runbooks/playbooks/security-breach.md`) | Low |
| 6 | Health information lands in logs or alerts | Remote | Significant | Allowlist logger (#1027) never logs bodies or notes; alerts to the support channel carry no personal data | Low |
| 7 | Health information is kept after the climber withdraws or leaves | Remote | Significant | Deleted at once on withdrawal and account deletion; backups age out within 30 days; devices drop it on sync | Low |
| 8 | A child under 16 agrees without a parent or guardian | Possible | Significant | The agreement statement requires 16+ or parental agreement; the Terms require 13+. Both are self-declared | Medium (accepted) |
| 9 | Health information is used beyond its purpose (function creep) | Remote | Significant | The single purpose is stated in the agreement and notice; cross-user figures are anonymised and combined only; no advertising, no sale, no AI training | Low |
| 10 | The climber can't take their health information elsewhere | Probable | Minimal | None yet: the export leaves it out | Medium, until #915 |
| 11 | Health information is lost (database loss) | Remote | Significant | Time Travel backups (7 days); off-platform backups planned for launch (#1068) | Low |

No risk is left high, so prior consultation with the ICO (Art. 36) isn't needed.

## Actions

- **Risk 2:** Two-Factor Authentication shipped in v2.131.0 (#1436), and passkeys, which also resist phishing, in #1439. 2FA stays optional: the residual risk for accounts without it is accepted.
- **Risk 3:** none beyond what's in place; accepted, because offline use at the crag is the app's core need and the controls are explained.
- **Risk 8:** accepted for now. Revisit with the Age Appropriate Design Code review in #1064 if under-18s become a real share of users.
- **Risk 10:** #915, the extended export schema, which the body-location model (#598) feeds.
- **Before #1409 and #1410 ship:** update this DPIA for cycle phase and energy and mood.
- **Threat model (#1031):** not written yet. When it is, cross-check risks 1, 2 and 5 against it.

## Sign-off

| | |
|---|---|
| Measures approved by | The controller, 18 October 2026 |
| Residual risks approved by | The controller, 18 October 2026 |
| DPO advice | Not applicable: no DPO is required (no large-scale core processing of special category data) |
| Professional review | Not planned: the controller decided against one (2026-10-18) |
