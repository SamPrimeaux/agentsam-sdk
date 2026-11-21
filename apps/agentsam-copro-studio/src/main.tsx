import React from "react";
import { createRoot } from "react-dom/client";
import { MovieModeApp } from "./MovieModeApp";
import { startHostTheme } from "./hostTheme";
void startHostTheme();
createRoot(document.getElementById("root")!).render(<React.StrictMode><MovieModeApp standalone /></React.StrictMode>);
