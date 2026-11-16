import { createFileRoute } from "@tanstack/react-router";
import { ChatsIndex } from "@/components/shell/ChatsIndex";

export const Route = createFileRoute("/(apps)/admin/chats/")({ component: ChatsIndex });
