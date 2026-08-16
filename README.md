`docker build -t brnstui --build-arg VITE_API_URL=https://api.example123.com --build-arg VITE_NIP85_RELAY_URL=wss://nip85.example.com .`

`docker run -d -p 3000:3000 --name brainstorm-ui brnstui`

## Deploying to staging

Staging runs images built by CI from branches of this repo
(`ghcr.io/nosfabrica/brainstorm-ui`), pinned and rolled out via the
[brainstorm-k8s](https://github.com/NosFabrica/brainstorm-k8s) charts
(`ui.image.tag` + `./deploy_staging.sh --ui`). The full branch/PR/pin
workflow — including how to decide whether to join the current staging branch
or start a new cycle — is documented in
[brainstorm-k8s `docs/staging-workflow.md`](https://github.com/NosFabrica/brainstorm-k8s/blob/master/docs/staging-workflow.md).