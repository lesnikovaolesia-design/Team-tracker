# ⏱️ Team Time Tracker

A web page that shows the team's Jira hours against an 8-hour daily goal:
hours per person per day, a team total, hours by project, every time entry,
and each person's assigned or touched tickets. Works for anyone with the link
and the team password: no Claude account or Jira connection needed.

## How it works

- `scripts/fetch.mjs` reads Jira with an API token: the time entries (worklogs)
  the five people logged in the last 8 weeks, and each person's assigned,
  updated or created tickets.
- It encrypts the result with the team password (AES-256-GCM, key from PBKDF2)
  into `site/data.enc.json`.
- `.github/workflows/update.yml` runs that every 30 minutes on workdays and
  publishes `site/` to GitHub Pages. The data file is never committed to git.
- `site/` is the page. It asks for the team password once and decrypts the
  data in the browser.

The team list, the daily goal and how many weeks to keep are in `scripts/team.mjs`.

## One-time setup

### 1. Create a Jira API token

1. Sign in at <https://id.atlassian.com/manage-profile/security/api-tokens>
   with the Atlassian account whose access the tracker should use. A shared
   service account with read access to the projects is best; your own works too.
2. **Create API token**, name it `team-tracker`, and copy it.

### 2. Add three repository secrets

In the repository: **Settings → Secrets and variables → Actions → New repository secret**.

| Name | Value |
|---|---|
| `JIRA_EMAIL` | the email of the Atlassian account from step 1 |
| `JIRA_API_TOKEN` | the token from step 1 |
| `TRACKER_PASSWORD` | a team password, at least 10 characters. Share it with the team privately |

### 3. Turn on GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

GitHub Pages can publish from a **private** repository only on a paid plan
(GitHub Pro, Team or Enterprise). On a free plan, either upgrade or make the
repository public. Public is safe here: the code holds no secrets, and the
data is published only in encrypted form. The page and code would be readable
by anyone, including the team's names and Jira account IDs in `scripts/team.mjs`.

### 4. Run it once

**Actions → Update tracker → Run workflow.** When it finishes, the page is at
the address shown under **Settings → Pages**, usually
`https://lesnikovaolesia-design.github.io/Team-tracker/`.

## Trying the page locally

```bash
TRACKER_PASSWORD=sample-password node scripts/sample.mjs
```

```bash
python3 -m http.server 8765 --directory site
```

Then open <http://localhost:8765> and enter `sample-password`. The sample data is made up.

## Notes

- Hours count on the day each entry was logged for, in that person's time zone.
- The page shows when the data was last updated. 🔄 Update loads the newest saved copy.
- Changing `TRACKER_PASSWORD` takes effect on the next run. Everyone then needs the new one.
- To stop the updates, disable the workflow under **Actions → Update tracker → ⋯ → Disable workflow**.
