import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { NativeRuntime } from '@/components/NativeRuntime';
import "./index.css";

createRoot(document.getElementById("root")!).render(<NativeRuntime><App /></NativeRuntime>);
