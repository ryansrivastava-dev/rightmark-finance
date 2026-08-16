# Contributing to RightMark

Thank you for helping improve RightMark.

## Before you begin

- Search existing issues before opening a new one.
- Keep changes focused and explain the user impact.
- Never commit credentials, private financial information, or non-public fisheries records.
- Preserve the distinction between public evidence, model assumptions, and illustrative financing scenarios.

## Development workflow

1. Fork the repository and create a short-lived branch from `main`.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Make the smallest coherent change.
4. Run:

   ```bash
   pnpm lint
   pnpm test
   ```

5. Open a pull request using the repository template.

## Pull request expectations

A strong pull request includes:

- a concise description of what changed and why;
- screenshots for visible UI changes;
- updated tests for behavior changes;
- notes about public-data, modeling, or regulatory assumptions;
- confirmation that the production build and tests pass.

## Financial and data integrity

RightMark is an educational prototype. New functionality must not imply that:

- an NMFS ID proves the visitor owns a quota asset;
- an evaluation is an appraisal or guaranteed market price;
- an illustrative option is a lender-approved offer;
- a completed scenario transfers funds, creates a lien, or executes a transaction.

When adding a data source, document its publisher, URL, update cadence, fallback behavior, and transformation logic.
