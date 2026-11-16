import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/admin/mail")({
  component: MailRoute,
});

function MailRoute() {
  return <LocalStudioWorkPage surface="mail" />;
}
