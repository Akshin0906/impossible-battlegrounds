# Deployment

The project is a static GitHub Pages-ready app with no backend, API key, account, database, or server rewrite requirement.

## Local Production Build

```bash
npm ci
npm run build
npm run preview
```

## Repository Pages Build

```bash
npm run build:pages
```

`build:pages` sets `VITE_BASE_PATH=/impossible-battlegrounds/` so assets load from a repository subpath.

## GitHub Actions

`.github/workflows/pages.yml`:

- installs dependencies with `npm ci`
- installs Playwright browser dependencies
- runs the full validation script
- uploads `dist` as the Pages artifact
- deploys from `main` when GitHub Pages is configured to use Actions

Actual publication is not required for v1 completion.
