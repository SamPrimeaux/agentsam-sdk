import { defineHandler } from "nitro/h3";
import { cloudflareEnv, providerReadiness } from "../../../lib/cloudflare-runtime";

export default defineHandler((event) => {
  return {
    providers: providerReadiness(cloudflareEnv(event)),
    auth_note: "Grok gate identity is viewer authentication; the grok model provider is the independent XAI_API_KEY inference lane.",
  };
});
