# Independent npm publication — Completeful, Merch and Ecommerce

Unlike the SDK-wide release train, these three packages can be
published independently and carry their own npm versions.

Run `node scripts/publish-selected-package.mjs --plan completeful`
for a read-only description of the selected package.

The protected release workflow source is
`scripts/release-workflows/publish-selected-package.yml`.
The GitHub connector cannot currently modify `.github/workflows`
(workflow write scope). An authorized repository maintainer must install it:

```sh
cp scripts/release-workflows/publish-selected-package.yml .github/workflows/publish-selected-package.yml
git add .github/workflows/publish-selected-package.yml
git commit -m 'ci: enable targeted ecommerce and merch npm publication'
git push
```

Once reviewed and merged to `main`, use GitHub Actions >
**Publish selected AgentSam package** and choose `completeful`,
`merch` or `ecommerce`. Only the selected package is built,
tested and published with npm provenance. An already published
version is rejected; npm versions cannot be overwritten.

Bump the changed package's version only. For Ecommerce also align
`agentsam.app.json`, `package-lock.json` and `npm-shrinkwrap.json`.
The full SDK train remains for train-coupled core packages.
Publishing does not update customer Workers, D1, R2 or consumer locks.
