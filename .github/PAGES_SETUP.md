# GitHub Pages Setup

The docs site is configured to automatically deploy to GitHub Pages on every push to `main`.

## One-time setup

You need to enable GitHub Pages for this repository:

1. Go to repository **Settings** → **Pages**
2. Under "Build and deployment":
    - **Source**: GitHub Actions
3. The workflow will automatically deploy on the next push to `main`

## How it works

The `.github/workflows/docs.yaml` workflow:

- **Triggers on**:
  - Push to `main` branch (when docs files change)
  - Pull requests to `main` (builds only, no deployment)

- **On push to main**:
  - Builds the docs site with MkDocs
  - Uploads as GitHub Pages artifact
  - Deploys to GitHub Pages
  - Site becomes available at: `https://ericmjl.github.io/canvas-chat/`

- **On pull requests**:
  - Builds the docs site to verify no errors
  - Does not deploy (build verification only)

## Checking deployment status

After pushing to `main`:

1. Go to **Actions** tab in the repository
2. Find the "Build and deploy documentation" workflow
3. Check the status (should show green checkmark when successful)
4. Click on the workflow run to see deployment URL
5. Site should be live at: `https://ericmjl.github.io/canvas-chat/`

## Troubleshooting

If the site doesn't deploy:

1. Check workflow logs in the **Actions** tab
2. Verify GitHub Pages is set to "GitHub Actions" source in repository settings
3. Check that permissions are set correctly (Settings → Actions → General → Workflow permissions → Read and write permissions)
4. Ensure the workflow has `pages: write` and `id-token: write` permissions (already configured)
