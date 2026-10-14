// Oldest first. A version that needs consent again asks anyone who agreed to an earlier one (#1121).
export const PAIN_INJURY_HISTORY = [
  {
    version: "2026-10-13",
    needsConsentAgain: true,
    changes: [],
    points: [
      "When it's on, you can tag pain and injuries on your climbs, and your Injury insights report shows patterns in them. That report can also use your Exertion ratings to look for links between effort and pain.",
      "Pain and injury details are health information, which data protection law treats as sensitive. That's why this is off until you agree to it.",
      "Your health information is stored with the rest of your logbook. It's never shown on your public profile.",
      "The site administrator can see it, only for support and moderation.",
      "You can turn it off at any time in My account. Turning it off deletes your pain and injury details.",
    ],
    statement:
      "I'm 16 or over, or my parent or guardian agrees to this. I agree to Climbing Logbook storing and processing my pain and injury information as described above.",
  },
  {
    version: "2026-10-14",
    needsConsentAgain: true,
    changes: [
      "It's now the Health Data Agreement, and covers your menstrual cycle phase and your energy and mood as well as pain and injuries.",
    ],
    points: [
      {
        label: "What it covers",
        text: "health information you choose to log: pain and injuries, which phase of your menstrual cycle you're in (by phase only, never dates), and your energy and mood.",
      },
      {
        label: "What it's for",
        text: "finding patterns in your climbing performance, shown only in your own Performance insights.",
      },
      { label: "You choose what's logged", text: "nothing is recorded unless you log it yourself." },
      {
        label: "Why we ask first",
        text: "data protection law treats health information as sensitive, so none of this is available until you agree.",
      },
      {
        label: "Who can see it",
        text: "it's stored with the rest of your logbook and never shown on your public profile. A site administrator can see it, only for support and moderation.",
      },
      {
        label: "Withdrawing",
        text: "you can withdraw at any time in My account. Withdrawing deletes all your health information from your logbook straight away, and from our backups within 30 days. Your climbs and other performance insights data are unaffected.",
      },
    ],
    statement:
      "I'm 16 or over, or my parent or guardian agrees to this. I agree to Climbing Logbook storing and using my health information as described above.",
  },
];

const CURRENT = PAIN_INJURY_HISTORY[PAIN_INJURY_HISTORY.length - 1];

export const PAIN_INJURY = { purpose: "pain_injury", version: CURRENT.version };
// A grant of wording older than this no longer counts: it was for wording that has since needed agreeing to again.
export const PAIN_INJURY_OLDEST_VALID_VERSION = (
  PAIN_INJURY_HISTORY.findLast(({ needsConsentAgain }) => needsConsentAgain) ?? PAIN_INJURY_HISTORY[0]
).version;
export const PAIN_INJURY_WORDING = { points: CURRENT.points, statement: CURRENT.statement };

export const pointText = point => (typeof point === "string" ? point : `${point.label}: ${point.text}`);

// Null unless the user agreed to older wording; then what's changed, and whether they need to agree again.
export function painInjuryConsentUpdate(agreedVersion) {
  if (!agreedVersion) return null;
  const newer = PAIN_INJURY_HISTORY.filter(({ version }) => version > agreedVersion);
  if (newer.length === 0) return null;
  return {
    version: CURRENT.version,
    required: newer.some(({ needsConsentAgain }) => needsConsentAgain),
    changes: newer.flatMap(({ changes }) => changes),
  };
}
