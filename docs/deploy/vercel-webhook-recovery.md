# Recovering the GitHub → Vercel auto-deploy webhook

**Symptom (observed 2026-04-18/19)**: `git push origin main` no longer triggers a Vercel production deploy. `vercel ls` shows the most recent auto-deploy is 16+ hours old despite several subsequent commits on `main`. Manual `vercel --prod --yes` from this directory works — so the account, tokens, and build itself are healthy; only the webhook link is broken.

## Root cause candidates

1. **GitHub App installation expired or was revoked** on `liminalcommons/liminal-calendar`. Vercel's GitHub App needs read access to the repo to receive push events.
2. **Repo was transferred / renamed** and the old Git connection in the Vercel project points to a stale path.
3. **Branch filter misconfig** — Vercel settings might be restricted to a branch other than `main`.
4. **Deploy hook disabled** at the project level (Settings → Git → "Ignored Build Step" accidentally set to `exit 0`).

## Manual fix (in the Vercel dashboard)

CLI cannot rewrite the git connection. From the browser:

1. Open https://vercel.com/lims-projects-13b37259/liminal-calendar-v3/settings/git
2. Under **Connected Git Repository**, check that the repo still reads `liminalcommons/liminal-calendar` and branch is `main`.
3. If it shows *"Repository not found"* or any warning: click **Disconnect**, then **Connect Git Repository** and re-link to `liminalcommons/liminal-calendar`.
4. Under **Ignored Build Step**, ensure it is empty or commented out.
5. Push a trivial commit (README change) and confirm `vercel ls` shows a new deployment within ~60s.

## Interim workflow until fixed

```bash
cd packages/liminal-calendar
git push origin HEAD
vercel --prod --yes
```

The `vercel --prod --yes` line is the only thing keeping production fresh right now.

## How to tell it's recovered

After `git push`, run `vercel ls` within a minute. A new deployment whose **Username** column matches a GitHub-initiated deploy (usually `github` rather than the user who ran CLI) confirms the webhook fired. Until then, assume you must deploy manually.
