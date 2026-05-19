import ReactDOM from "react-dom/client";
import "./index.css";
import { FloatingNoteHost } from "./features/FloatingNoteHost";
import { getStoredDrawerSize } from "./features/drawerPrefs";
import { getStoredTriggerMode } from "./features/triggerModel";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <FloatingNoteHost
    getStoredDrawerSize={getStoredDrawerSize}
    getStoredTriggerMode={getStoredTriggerMode}
  />
);
