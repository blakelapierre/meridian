import { createFileRoute } from "@tanstack/react-router";
import { AshenHold } from "@/components/AshenHold";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <AshenHold />;
}
