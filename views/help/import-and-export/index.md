---
layout: help-layout.njk
title: Import and export – Climbing Logbook
eleventyNavigation:
  key: Import and export
  order: 8
---

# Import and export

You can bring climbs in from a spreadsheet and take your logbook out as a file. Both live in **My account**, and both need a connection.

## Import climbs

1. Go to **My account**, then **Import entries**.
2. Press **Download CSV template**, or use a JSON file you exported earlier.
3. Fill it in. Keep the column headings exactly as they are, in the same order.
4. Choose your CSV or JSON file and press **Import**.

Every climb needs these:

- **name**: the problem or route name.
- **grade**: the grade, in any scale for that discipline.
- **discipline**: boulder or sport.
- **status**: send, project, archived or checkout.
- **location**: where the climb is.
- **sportStyle**: lead or top_rope. Sport climbs only.

These are optional:

- **firstAttempt**: write true if you did it first go.
- **date**: as YYYY, YYYY-MM or YYYY-MM-DD.
- **area**: the area within the location.
- **country**: the country.
- **video**: a web link.
- **notes**: anything you want to remember.
- **attemptsToSend**: how many tries it took to send.
- **rpe**: how hard the climb felt (Exertion), 0–100 in steps of 10.
- **gradeScale**: which scale the grade's in. Leave it blank to fall back to the same default as before. See [Grade scales & conversion](/help/grade-scales/).

Places are matched by location and area, or created if they're new.

### If something's wrong

An import is all or nothing. If any row has a problem, nothing is imported and you'll see a list of what to fix, with the row number for each. Row 1 is the heading row, so your first climb is row 2. Fix the file and try again.

### Good to know

- **500 climbs at most** in one file. Split a larger logbook into more than one file.
- **Importing the same file twice adds every climb twice.** There's no duplicate check.

## Export your logbook

Go to **My account**, find **Export entries**, and press **CSV** or **JSON**. You'll get a file called climbing-logbook-export.csv or climbing-logbook-export.json.

Each climb includes:

- Name, grade, grade scale, discipline and status
- First attempt and date
- Location, area and country
- Video, notes and sport style
- Attempts to send and exertion (RPE)

It doesn't include your move tagging -- the strengths/weaknesses (hardest/easiest moves) or pain/injury details.
