---
layout: help-layout.njk
title: Import and export – Climbing Logbook
eleventyNavigation:
  key: Import and export
  order: 8
---

# Import and export

You can bring climbs in from a spreadsheet and take your logbook out as a file. Both live in **My account**, and both need a connection.

## Export your logbook

Go to **My account**, find **Export entries**, and press **CSV** or **JSON**. You'll get a file called `climbing-logbook-export.csv` or `.json`.

The file has each climb's name, grade, discipline, status, first attempt, date, location, area, country, video, notes and sport style. It doesn't include Athlete Mode details (exertion, attempts, moves and pain) or which grade scale you used.

## Import climbs

1. Go to **My account**, then **Import entries**.
2. Press **Download CSV template**, or use a JSON file you exported earlier.
3. Fill it in. Keep the column headings exactly as they are, in the same order.
4. Choose your `.csv` or `.json` file and press **Import**.

Each row needs a `name`, `grade`, `discipline` (`boulder` or `sport`), `status` (`send`, `project`, `archived` or `checkout`) and `location`. Sport rows also need a `sportStyle` (`lead` or `top_rope`). The rest is optional: `firstAttempt` (write `true`), `date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), `area`, `country`, `video` (a web link) and `notes`.

Places are matched by name, or created if they're new.

## If something's wrong

An import is all or nothing. If any row has a problem, nothing is imported and you'll see a list of what to fix, with the row number for each. Row 1 is the heading row, so your first climb is row 2. Fix the file and try again.

## Good to know

- **500 rows at most** in one file. Split larger logbooks into more than one.
- **Importing the same file twice adds every climb twice.** There's no duplicate check.
- **Grades are matched to a default scale.** Boulder grades use Font (Non-standard) and Sport grades use French, so the app shows them in that scale. See [Grade scales & conversion](/help/grade-scales/).
