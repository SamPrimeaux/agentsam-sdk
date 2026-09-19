export function createGitAdapter(config = {}) {
  return {
    type: 'engineering.git',
    config,
    toWorkItems(commits = []) {
      return commits.map((commit) => {
        if (!commit.sha && !commit.id) throw new TypeError('git commit requires sha or id');
        return {
          id: String(commit.sha ?? commit.id),
          title: String(commit.subject ?? commit.message ?? 'Commit').split('\n')[0],
          type: 'commit',
          status: 'complete',
          owner: commit.author ?? null,
          start: commit.date ?? null,
          end: commit.date ?? null,
          artifacts: commit.url ? [commit.url] : [],
          evidence: [String(commit.sha ?? commit.id)],
        };
      });
    },
  };
}
