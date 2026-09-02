/**
 * @deprecated Use the local CLI's `agentsam init --name <project>`.
 */
export function scaffoldProject() {
  throw new Error(
    'scaffoldProject() is deprecated. Run: npx @inneranimalmedia/agentsam-sdk init --name my-agent --yes. Local scaffolding does not require a cloud account.',
  );
}
