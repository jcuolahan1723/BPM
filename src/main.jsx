import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ProjectProvider } from "./project.jsx";

createRoot(document.getElementById("root")).render(
  <ProjectProvider>
    <App />
  </ProjectProvider>
);
