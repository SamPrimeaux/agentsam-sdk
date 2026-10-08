/** Single canonical site.scrape command: Node native by default.
 * The Python scraper is maintained only as an optional package-local adapter.
 */
import { runNativeSiteScrape } from '../../packages/agentsam-site-scrape/runtime/node-runner.mjs';

export async function runSiteScrape(args) {
  const status=await runNativeSiteScrape(args);
  if(status)process.exitCode=status;
}
