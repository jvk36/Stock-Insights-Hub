import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root")!;
root.replaceChildren();
createRoot(root).render(<App />);
