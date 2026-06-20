import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MboxPageShell } from "./components/MboxPageShell";
import { ShowcaseDashboard } from "./features/showcase/ShowcaseDashboard";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MboxPageShell wide>
      <ShowcaseDashboard />
    </MboxPageShell>
  </StrictMode>
);