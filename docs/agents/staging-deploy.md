# Shipping a change to staging

The flow an agent follows when asked to "create a PR from this change, merge it into staging, and deploy staging". There is no ready-to-ship gate on `staging` — any reviewed change can go in.

## Default scope

- **By default, create the PR and stop.** Report the PR URL, then walk the user through the merge and deploy steps below.
- **Merge and deploy only on the user's explicit go-ahead** — both are outward-facing and staging is shared. If the user asked for the full flow up front ("PR, merge and deploy"), that counts as the go-ahead; still report each step as it lands.

## 1. Branch

If the change sits on `staging` or `main`, move it to a branch off `staging` first (`feat/…`, `fix/…`, `docs/…`). Commit, then push to `origin` (the NosFabrica repo, not a fork):

```bash
git switch -c feat/<name>   # from an up-to-date staging
git push -u origin feat/<name>
```

## 2. Open the PR

```bash
gh pr create --base staging --title "..." --body "..."
```

Use a heredoc for multi-line bodies. **Default stopping point** — share the URL and summarize steps 3–6.

## 3. Merge (on go-ahead)

```bash
gh pr merge <number> --merge --delete-branch
```

Merge commits, not squash — matches the repo history and the `staging` → `main` promotion.

## 4. Wait for the staging image

`.github/workflows/build.yml` runs on every push and rebuilds `ghcr.io/nosfabrica/brainstorm-ui:staging` in place. Deploying before it goes green re-pulls the old image.

```bash
gh run list --branch staging --workflow build.yml --limit 1
gh run watch <run-id> --exit-status
```

## 5. Deploy (on go-ahead)

Deploys run from a checkout of [brainstorm-k8s](https://github.com/NosFabrica/brainstorm-k8s):

```bash
git pull                     # deploy_staging.sh refuses an out-of-sync checkout
grep -A4 '^ui:' charts/brainstorm/staging-values.yaml   # tag must be `staging`
./deploy_staging.sh --ui     # kube context must be the staging cluster (deploy_targets.conf)
```

If `ui.image.tag` is not `staging`, **stop and tell the user** — never repin it yourself. The tag is mutable, so the script's rollout restart is what pulls the new image.

## 6. Verify

```bash
kubectl -n staging rollout status deploy/brainstorm-brainstorm-ui
kubectl -n staging get deploy brainstorm-brainstorm-ui \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Then load https://brainstorm-staging.nosfabrica.com and check the change. CI is the test run — don't plan on local `npm`. Prod (`main`, `latest`) is untouched by this flow; promotion is the core team's call (see `CLAUDE.md`).
