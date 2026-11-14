import { createFileRoute } from "@tanstack/react-router";
import { MarsGame } from "@/components/game/MarsGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mars Base Buddies — Explore. Manage. Survive." },
      { name: "description", content: "A colourful 2D Mars exploration and colony game for kids aged 7–12." },
      { property: "og:title", content: "Mars Base Buddies" },
      { property: "og:description", content: "Explore a Mars colony with your astronaut and PIP the robot buddy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarsGame,
});
