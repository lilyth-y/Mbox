import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MboxPageShell } from "./components/MboxPageShell";
import { WeddingSimpleDashboard } from "./features/wedding-simple/WeddingSimpleDashboard";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MboxPageShell wide>
      <WeddingSimpleDashboard active />
    </MboxPageShell>
  </StrictMode>
);