# Docker

HarnessAmp can be served as a static production container.

## Build

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" npm run docker:build
```

## Run

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" docker run --rm -p 8088:80 harnessamp:local
```

Open `http://127.0.0.1:8088`.

## Notes

- The image is multi-stage: Node builds the Vite bundle, and Nginx serves the static output.
- The Nginx config uses `try_files` so the SPA still resolves correctly on refresh.
- On macOS, Docker Desktop may be installed even if `docker` is not already on your shell `PATH`.
