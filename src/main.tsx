import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { injectEmbeddedFontFaces } from "./utils/embeddedFontLoader";

// Регистрируем @font-face встроенных шрифтов до первого рендера canvas,
// чтобы редактор и PDF использовали одинаковые файлы шрифтов.
injectEmbeddedFontFaces(import.meta.env.BASE_URL);

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
