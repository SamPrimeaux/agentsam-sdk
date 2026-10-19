# Releasing agentsam-sdk to PyPI

Releases are tag-triggered and published with PyPI Trusted Publishing (OIDC), so no API
token is stored anywhere. The workflow is `.github/workflows/publish-python.yml`; the
Python package lives in this repo's `python/` directory and is versioned independently
of the npm package.

## One-time setup

1. PyPI: Account settings -> Publishing -> add a **pending publisher** with
   - Project name: `agentsam-sdk`
   - Owner: `SamPrimeaux`, Repository: `agentsam-sdk`
   - Workflow: `publish-python.yml`, Environment: `pypi`

   A pending publisher does not reserve the name; run the first release soon after.
2. GitHub: repo Settings -> Environments -> create `pypi` and add yourself as a required
   reviewer, so every publish waits for your approval.

## Cutting a release

```bash
cd python
# 1. bump __version__ in agentsam_sdk/__init__.py (single source of truth) and merge to main
python -m unittest discover -s tests          # needs `npm ci` at the repo root for the bridge tests
rm -rf dist build *.egg-info                  # artifacts are gitignored; never commit them
python -m build && python -m twine check dist/* && python scripts/check-dist.py dist   # or: uv build
# 2. tag the merged commit; the tag name must equal py-v<__version__>
git tag py-v0.1.0 && git push origin py-v0.1.0
```

The tag push runs the workflow:

1. **build** checks the tag points at a commit on `main`, matches `__version__`, builds the
   wheel and sdist, runs `twine check` and `scripts/check-dist.py`, and smoke-tests the
   wheel in a clean venv.
2. **publish** waits for your approval on the `pypi` environment, then uploads through
   OIDC. The first successful run creates the project; the pending publisher becomes a
   normal trusted publisher.

PyPI never allows re-uploading a version. If a release is bad, yank it on PyPI and publish
a new version; do not delete and retag.

## Manual fallback

If Actions is unavailable, upload locally with a project-scoped token (use an account-wide
token only for the very first upload, then replace it):

```bash
cd python && uv build && uv publish          # or: python -m twine upload dist/*
```

## Runtime note

`AgentSamClient.invoke()` delegates to the Node SAM kernel, so users also need
`npm install @inneranimalmedia/agentsam-sdk`. See the package README.
