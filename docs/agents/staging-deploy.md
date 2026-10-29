# Shipping a change to staging

The flow an agent follows when asked to "create a PR from this change, merge it into staging, and deploy staging". There is no ready-to-ship gate on `staging` — any reviewed change can go in.

Deploying is not a step of its own: merging into `staging` deploys it. CI rebuilds the staging image and staging rolls it out automatically — there is no deploy script to run.

## Default scope

- **By default, create the PR and stop.** Report the PR URL, then walk the user through the merge below.
- **Merge only on the user's explicit go-ahead** — merging is deploying, and staging is shared. If the user asked for the full flow up front ("PR, merge and deploy"), that counts as the go-ahead; still report each step as it lands.

## 1. Branch

If the change sits on `staging` or `main`, move it to a branch off `staging` first (`feat/…`, `fix/…`, `docs/…`). Commit, then push to `origin` (the NosFabrica repo, not a fork):

```bash
git switch -c feat/<name>   # from an up-to-date staging
git push -u origin feat/<name>
```

**Anything with a database migration behind it** — the admin trusted lists,
scheduling policies, billing plan mappings — can't move between branches and
environments like plain UI. Before changing one of those, confirm which
environment and branch the backend's migrations are at, and that the UI change
tolerates the environment it lands on first (staging may be ahead of prod, or
behind a feature branch). Plain UI changes need no such check.

## 2. Open the PR

```bash
gh pr create --base staging --title "..." --body "..."
```

Use a heredoc for multi-line bodies. **Default stopping point** — share the URL and summarize steps 3–5.

## 3. Merge (on go-ahead)

```bash
gh pr merge <number> --merge --delete-branch
```

Merge commits, not squash — matches the repo history and the `staging` → `main` promotion.

## 4. Wait for the rollout

`.github/workflows/build.yml` runs on every push and rebuilds `ghcr.io/nosfabrica/brainstorm-ui:staging` in place (about 10 minutes). Staging then rolls the new image out on its own: the `brainstorm-ui-autodeploy` CronJob checks the registry every 5 minutes, so allow up to 5 more minutes after the run goes green. Until then, staging still serves the previous build.

```bash
gh run list --branch staging --workflow build.yml --limit 1
gh run watch <run-id> --exit-status
```

Don't run `./deploy_staging.sh --ui` from [brainstorm-k8s](https://github.com/NosFabrica/brainstorm-k8s) after a merge — that manual step is gone. The rollout follows the mutable `staging` tag the brainstorm-k8s charts pin (`ui.image.tag: staging`); if that is ever anything else, **stop and tell the user** — never repin it yourself.

## 5. Verify

Without access to the cluster, look for a string the change adds in the live bundle. Pages that load lazily ship in their own chunks, named in the index bundle (`FinishSetupPage-<hash>.js`, …):

```bash
curl -s https://brainstorm-staging.nosfabrica.com/ | grep -o '/assets/index-[^"]*\.js'
curl -s https://brainstorm-staging.nosfabrica.com/assets/index-<hash>.js | grep -c '<a string from the change>'
```

With access to the staging cluster:

```bash
kubectl -n staging rollout status deploy/brainstorm-brainstorm-ui
kubectl -n staging get deploy brainstorm-brainstorm-ui \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Then load https://brainstorm-staging.nosfabrica.com and check the change. CI is the test run — don't plan on local `npm`. Prod (`main`, `latest`) is untouched by this flow; promotion is the core team's call (see `CLAUDE.md`).
