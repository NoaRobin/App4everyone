import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter-tight/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/editorial.css";
import "./styles/spaces.css";
import "./styles/pages.css";
import "./styles/home.css";
import { App } from "./App";
import { AppProvider } from "./lib/context";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
