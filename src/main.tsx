import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css"; // 确保引了样式
import { installRendererDiagnostics } from './utils/rendererDiagnostics';

installRendererDiagnostics();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);
