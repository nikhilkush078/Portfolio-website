# Portfolio website

This is a static portfolio with a Vercel serverless article API. The public article list is backed by `GET /api/articles`. The admin page at `/admin.html` publishes a title, description, date, time, category, and optional image to the GitHub repository through the GitHub Contents API.

## Vercel setup

1. Import this repository into Vercel. No build command is required.
2. Create a GitHub fine-grained token with **Contents: Read and write** access to this repository.
3. Add these Vercel environment variables for Production (and Preview if needed):
   - `GITHUB_TOKEN`: the fine-grained GitHub token
   - `GITHUB_OWNER`: `nikhilkush078`
   - `GITHUB_REPO`: `Portfolio-website`
   - `ADMIN_PASSWORD`: a long, private password
4. Redeploy after adding the variables.

The API stores the catalog in `articles/articles.json` and uploaded images in `images/articles/`. GitHub commits may take a few seconds to appear in the public API because GitHub is the content store.

## Local preview

Opening `index.html` directly still shows the committed catalog through the static fallback. To test the admin form and `/api/articles`, run the project through Vercel's local development server after installing the Vercel CLI and setting the same environment variables:

```text
vercel dev
```