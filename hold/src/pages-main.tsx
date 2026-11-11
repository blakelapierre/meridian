import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AshenHold } from "@/components/AshenHold";
import "@/styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AshenHold />
    </StrictMode>,
  );
}
