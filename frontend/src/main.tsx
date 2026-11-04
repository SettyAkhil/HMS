import React, { useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import PatientRecordPage from "./components/patientRecord/PatientRecordPage"
import { cardTokenFromHash, patientCodeFromHash } from "./components/patientRecord/patientRecord"
import "./index.css"

// `#/patient/<code>` is the page a scanned OP card opens in its own tab (staff,
// signed in): the patient's complete record, outside the app shell.
// `#/card/<token>` is the same page opened from the card's QR, with no login.
function Root() {
  const read = () => ({ code: patientCodeFromHash(), card: cardTokenFromHash() })
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onHash = () => setRoute(read())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  if (route.card) return <PatientRecordPage key={`card:${route.card}`} cardToken={route.card} />
  if (route.code) return <PatientRecordPage key={route.code} code={route.code} />
  return <App />
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
