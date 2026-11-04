import { createRoot } from "react-dom/client"
import App from "./app/App.tsx"
import "./styles/index.css"

// The host HMS app has no dark mode -- it's always light. Keppler AI's own
// ThemeProvider (@figma/astraui) otherwise defaults to the OS's
// prefers-color-scheme, which would make this embedded app go
// near-black while the rest of the HMS stays white. Force it light so the
// embed always matches, before ThemeProvider's first read of this key.
localStorage.setItem("astra-theme", "light")
document.documentElement.classList.remove("dark")

createRoot(document.getElementById("root")!).render(<App />)
