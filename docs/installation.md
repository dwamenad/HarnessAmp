# Installation

```bash
npm install
npm run dev
```

The dev server opens the local Vite app. Use the bundled demo bundle or paste your own JSON into the editor.

For a production build:

```bash
npm run build
```

For a containerized production run:

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" npm run docker:build
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" docker run --rm -p 8088:80 harnessamp:local
```
