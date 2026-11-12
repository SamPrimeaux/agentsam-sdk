import { createFileRoute } from "@tanstack/react-router";
import { GoalGuruHost } from "@/components/goals/GoalGuruHost";

/** The same installed GoalGuru app works as a full page or as a Side Stage. */
export const Route = createFileRoute("/(apps)/goalguru")({
  component: () => <GoalGuruHost mode="page" />,
});
