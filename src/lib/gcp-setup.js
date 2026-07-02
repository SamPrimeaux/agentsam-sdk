/**
 * GCP setup guidance — never assume platform VM is the user's project.
 */

export function printGcpConnectGuide() {
  console.log(`
  Connect YOUR Google Cloud project:

    # SSH / headless (open URL on any device, paste code back):
    gcloud auth login --no-browser
    gcloud config set project YOUR_PROJECT_ID
    export USER_GCP_PROJECT=YOUR_PROJECT_ID

    # On YOUR GCP VM (your service account on your project):
    gcloud auth application-default print-access-token

  Agent Sam does not use Inner Animal Media's platform VM as yours unless
  USER_GCP_PROJECT matches the VM metadata project-id.
`);
}

/**
 * @param {import('./detect-context.js').detectContext extends (...args: any) => Promise<infer R> ? R : never} ctx
 * @param {{ ask: (q: string) => Promise<string> } | null} prompt
 */
export async function confirmGcpOwnership(ctx, prompt) {
  if (!ctx?.gcp || ctx.gcp.scope !== 'unverified' || !ctx.gcp_vm) {
    return ctx;
  }

  if (!prompt) {
    printGcpConnectGuide();
    return ctx;
  }

  const pid = ctx.gcp.project_id || 'unknown';
  const ans = await prompt.ask(
    `  GCP VM metadata shows project "${pid}". Is this YOUR Google Cloud project? (y/n): `,
  );
  if (ans.toLowerCase() === 'y') {
    console.log(`\n  Tip: export USER_GCP_PROJECT=${pid} to skip this prompt next time.\n`);
    return {
      ...ctx,
      gcp: { ...ctx.gcp, scope: 'user-confirmed' },
    };
  }

  printGcpConnectGuide();
  return {
    ...ctx,
    gcp: null,
    gcp_vm: false,
  };
}
