import { createFileRoute } from "@tanstack/react-router";
import { ChatsIndex } from "@/components/shell/ChatsIndex";

export const Route = createFileRoute("/_app/chats/")({ component: ChatsIndex });
