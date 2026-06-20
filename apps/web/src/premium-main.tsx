import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MboxPageShell } from "./components/MboxPageShell";
import { PremiumPhysicsDashboard } from "./features/premium/PremiumPhysicsDashboard";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MboxPageShell>
      <PremiumPhysicsDashboard />
    </MboxPageShell>
  </StrictMode>
);