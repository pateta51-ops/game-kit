import { createRoot } from "react-dom/client";
import { Demo } from "./Demo.tsx";
import "../looks/plain.css";

createRoot(document.getElementById("root")!).render(<Demo />);
