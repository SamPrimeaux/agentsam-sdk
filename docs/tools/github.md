# GitHub

Every GitHub read (repos, branches, commits, PRs, issues, workflow runs) and write (commit, patch, branch, PR, comment) operation.

**36 tools** in this domain.

## `gh.pr` (1)

- **`agentsam_gh_pr_list`** (GitHub CLI PR List) — List pull requests via gh pr list (JSON). Complements agentsam_github_pr_list REST tool. _never used_

## `github.issue` (1)

- **`agentsam_github_issue`** (GitHub Issue) — Create or manage GitHub issues using your connected GitHub account. Requires explicit owner/repo.

## `github.pr` (1)

- **`agentsam_github_pr`** (GitHub PR) — Open a pull request using your connected GitHub account. Requires explicit owner/repo, title, head, and base. _risk: high_

## `github.read` (21)

- **`agentsam_github_check_permission`** (GitHub Check Permission) — READ ONLY — return your effective permission level (admin/write/read/none) on a repository. _never used_
- **`agentsam_github_commit_get`** (GitHub Commit Get) — READ ONLY — get a single commit's full details (repo + sha required). Use agentsam_github_list_commits for bulk. _never used_
- **`agentsam_github_commit_status_get`** (GitHub Commit Status Get) — READ ONLY — get the combined commit status/CI checks for a commit (repo + sha required). _never used_
- **`agentsam_github_compare`** (GitHub Compare Commits) — READ ONLY — compare two refs/commits (base...head): ahead_by, behind_by, changed files. _never used_
- **`agentsam_github_job_logs_get`** (GitHub Job Logs Get) — READ ONLY — fetch raw log output for a single Actions job (repo + job_id required). Call agentsam_github_workflow_jobs_list first to find job_id. _never used_
- **`agentsam_github_list_branches`** (GitHub List Branches) — READ ONLY — list branches for a repository (paginated, up to 300). Use to discover a real base ref before agentsam_github_create_branch. Never invent main.
- **`agentsam_github_list_commits`** (GitHub List Commits) — READ ONLY — list recent commits for a branch/ref. _★ heavily used (107 calls)_
- **`agentsam_github_pr_diff`** (GitHub PR Diff) — READ ONLY — fetch the full unified diff for a pull request. _never used_
- **`agentsam_github_pr_files`** (GitHub PR Changed Files) — READ ONLY — list filenames changed in a pull request. Call before fetching a single-file patch.
- **`agentsam_github_pr_get`** (GitHub PR Get) — READ ONLY — fetch a single pull request's metadata (title, state, head/base refs, body).
- **`agentsam_github_pr_list`** (GitHub PR List) — READ ONLY — list pull requests for a repo, optionally filtered by state/base/head.
- **`agentsam_github_read`** (GitHub Read) — Read a file from GitHub using your connected GitHub account. Requires explicit owner/repo and path. _★ heavily used (310 calls)_
- **`agentsam_github_read_many`** (GitHub Batch File Read) — When you need several files at once, batch-read paths; pass metadata_only:true for sha/size without content.
- **`agentsam_github_repo_get`** (GitHub Repo Get) — READ ONLY — repository snapshot: full_name, default_branch, private, archived, your permission level. Call before create_branch/compare/create_pr when default_branch is unknown.
- **`agentsam_github_repo_list`** (List GitHub Repos) — READ ONLY — list repositories for the connected GitHub account. Not a file reader — use agentsam_github_read/tree/search for contents.
- **`agentsam_github_search`** (GitHub Code Search) — READ ONLY — GitHub code search scoped to one repo. Rate-limited (~10/min). Prefer agentsam_github_tree for browsing. _★ heavily used (332 calls)_
- **`agentsam_github_search_issues_prs`** (GitHub Search Issues/PRs) — READ ONLY — search issues and pull requests using search syntax. Distinct from agentsam_github_search which searches code.
- **`agentsam_github_tree`** (GitHub Repo Tree) — Read GitHub data for the explicit owner/repo. Never use a catalog repo default. _★ heavily used (265 calls)_
- **`agentsam_github_workflow_jobs_list`** (GitHub Workflow Jobs List) — READ ONLY — list jobs within a workflow run. Use to find job_id before pulling logs. _never used_
- **`agentsam_github_workflow_run_get`** (GitHub Workflow Run Get) — READ ONLY — get a single Actions workflow run's status/details. _never used_
- **`agentsam_github_workflow_runs_list`** (GitHub Workflow Runs List) — READ ONLY — list Actions workflow runs, optionally filtered by branch/workflow_id/status/event. _never used_

## `github.write` (12)

- **`agentsam_github_comment_create`** (GitHub Comment Create) — Create a comment on an issue or pull request. PRs use issue_number for comments. _risk: high, never used_
- **`agentsam_github_commit_status_set`** (GitHub Commit Status Set) — Set a commit status/CI check. state must be error|failure|pending|success. _risk: high, never used_
- **`agentsam_github_commit_tree`** (GitHub Commit Tree) — Commit multiple files in one GitHub tree. Requires explicit owner/repo, message, files, and branch.
- **`agentsam_github_create_branch`** (GitHub Create Branch) — Create a remote branch from a base ref or SHA. Does not create a local checkout. Call before patch/commit_tree/write when the target branch doesn't exist yet. Discover base via agentsam_github_list_branches. _risk: high_
- **`agentsam_github_create_repo`** (GitHub Create Repo) — Create a new GitHub repository. Greenfield scaffold path. Defaults private=true, auto_init=true. _risk: high_
- **`agentsam_github_delete`** (GitHub Delete File) — Delete a file via Contents API. Resolves current blob sha automatically if omitted. _risk: high, never used_
- **`agentsam_github_delete_branch`** (GitHub Delete Branch) — Delete a remote branch ref. Irreversible unless SHA recovered elsewhere. _risk: high, never used_
- **`agentsam_github_patch`** (GitHub Patch File) — Surgical find/replace on an existing GitHub branch (exact unique match or fail). Branch must already exist — create it first. Never default to main. _risk: high_
- **`agentsam_github_pr_create`** (GitHub PR Create) — Open PR after branch is pushed (terminal git push first). Do not use Contents API to simulate multi-file PRs. _never used_
- **`agentsam_github_pr_merge`** (GitHub PR Merge) — Merge an existing, already-open pull request. Does not create or approve. _risk: high, never used_
- **`agentsam_github_pr_update`** (GitHub PR Update) — Update an already-open pull request's title/body/state/base. Does not create or merge. _risk: high, never used_
- **`agentsam_github_write`** (GitHub Write) — Write a file to GitHub. Requires explicit owner/repo, path, content, message, and branch. _risk: high_
