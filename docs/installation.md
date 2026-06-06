# Installation

```bash
npm install
npm run dev
```

`npm run dev` starts the local Vite app on `4173` and the local API runtime on `3000`. If `HARNESSAMP_DEV_AUTH` is unset, the API seeds a local dev session automatically.

Use the bundled demo bundle or paste your own JSON into the editor.

For GitHub login:

```bash
cp .env.example .env.local
```

Then set:

```text
SESSION_SECRET
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
APP_BASE_URL=http://127.0.0.1:4173
HARNESSAMP_DEV_AUTH=0
```

See [GitHub OAuth setup](github-oauth.md).

For OAuth locally, run:

```bash
npm run dev
```

If you prefer split terminals, use `npm run dev:api` and `npm run dev:web`.

For local API details, worker commands, required environment variables, and production worker deployment guidance, see [API and Worker Deployment](deployment.md).

For a production build:

```bash
npm run build
```

For CI and release gating:

```bash
npm run collect:failures -- examples/demo-bundle.json examples/cli/observed-runs.json
npm run release:gate -- examples/demo-bundle.json examples/cli/observed-runs.json
```

For a containerized production run:

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" npm run docker:build
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" docker run --rm -p 8088:80 harnessamp:local
```
