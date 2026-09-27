import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/mail")({
  component: MailRoute,
});

function MailRoute() {
  return <LocalStudioWorkPage surface="mail" />;
}
