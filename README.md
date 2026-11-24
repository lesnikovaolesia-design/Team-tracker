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

### 5. Optional: projects the main account can't see

The job only sees what the `JIRA_API_TOKEN` account can see. If a teammate logs
time in a project that account has no access to, either:

- **Best:** use a Jira account that can read every project the team works in,
  such as a shared service account. Ask your Jira admin.
- **Or add up to 4 extra accounts.** Give the teammate access to this repository
  (**Settings → Collaborators**). She creates her own API token and adds two
  secrets herself, so nobody else sees her token:
  `JIRA_EMAIL_2` and `JIRA_API_TOKEN_2` (the next person uses `_3`, and so on up to `_5`).
  The job reads Jira with every account and counts each time entry once.
  An extra account that stops working is skipped, and the job notes it in its log.

### 6. Optional: make 🔄 Update read Jira right away

Without this, 🔄 Update only loads the newest saved copy, and GitHub saves one
about every hour. With it, anyone with the team password can press 🔄 Update to
start the job and see fresh data about a minute later. A small free Cloudflare
helper (`worker/trigger.js`) holds a GitHub key that can only start this one job.

**A. Make the GitHub key**

1. Open <https://github.com/settings/personal-access-tokens/new>.
2. **Token name:** `team-tracker-update`. **Expiration:** 1 year.
3. **Repository access:** Only select repositories → `Team-tracker`.
4. **Permissions → Repository permissions → Actions:** Read and write.
5. **Generate token** and copy it. It starts with `github_pat_`.

**B. Make the Cloudflare helper**

1. Sign up or sign in at <https://dash.cloudflare.com/>. The free plan is enough.
2. Go to **Workers & Pages → Create → Start with Hello World**, name it
   `team-tracker-update`, and press **Deploy**.
3. Press **Edit code**, delete everything there, paste the whole of
   `worker/trigger.js`, and press **Deploy**.
4. Go back to the worker, then **Settings → Variables and Secrets → Add**. Add two,
   each with type **Secret**:
   - `GITHUB_TOKEN`: the key from part A
   - `TRACKER_PASSWORD`: the team password
5. Copy the worker's address, like `https://team-tracker-update.<your-name>.workers.dev`.

**C. Connect the page**

Put that address in `site/config.js` as `triggerUrl` and push. The button then
says "Asking Jira…", "Reading Jira… 0:30" and "✅ Fresh from Jira". If the
helper can't be reached, the button loads the newest saved copy, as before.

The helper starts the job at most once every 2 minutes, and only for people who
know the team password. When the GitHub key expires, make a new one and replace
`GITHUB_TOKEN`.

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
- The page shows when the data was last updated. 🔄 Update reads Jira right away once step 6 is set up, and otherwise loads the newest saved copy.
- Changing `TRACKER_PASSWORD` takes effect on the next run. Everyone then needs the new one.
- To stop the updates, disable the workflow under **Actions → Update tracker → ⋯ → Disable workflow**.
