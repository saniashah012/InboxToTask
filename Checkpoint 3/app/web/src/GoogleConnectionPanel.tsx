import { useEffect, useRef, useState } from "react"
import { googleConnectionAction, googleConnectionStatus, type GoogleStatus } from "./storageAdapter"

export default function GoogleConnectionPanel() {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const live = useRef(false)
  useEffect(() => {
    live.current = true
    let cancelled = false
    const outcome = new URL(window.location.href).searchParams.get("google")
    if (outcome) {
      setNotice(outcome === "connected" ? "Google connection returned. Confirm its saved status below." : "Google connection did not complete. Use the same email as your app account, grant Gmail access, and try again.")
      const clean = new URL(window.location.href); clean.searchParams.delete("google")
      window.history.replaceState(null, "", clean.pathname + clean.search + clean.hash)
    }
    googleConnectionStatus().then((result) => { if (!cancelled) setStatus(result) })
      .catch((err) => { if (!cancelled) setError((err as Error).message) })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true; live.current = false }
  }, [])
  async function run(action: "connect" | "check" | "disconnect" | "reload") {
    setBusy(true); setError(""); setNotice("")
    try {
      if (action !== "reload") {
        const result = await googleConnectionAction(action)
        if (!live.current) return
        if (action === "connect") {
          const destination = new URL(result.authorizationUrl ?? "")
          if (destination.origin !== "https://accounts.google.com" || destination.pathname !== "/o/oauth2/v2/auth") throw new Error("Invalid Google authorization destination.")
          window.location.assign(destination.href)
          return
        }
        setNotice(action === "disconnect" ? "Google disconnected. Scanning remains disabled." : "A backend access token is available. No email was read.")
      }
    } catch (err) { if (live.current) setError((err as Error).message) }
    finally {
      // Refresh even on failed revocation/refresh so stale connected state is
      // replaced with disconnecting/reconnect_required from the database.
      if (live.current) {
        try { const next = await googleConnectionStatus(); if (live.current) setStatus(next) }
        catch { if (live.current) setStatus(null) }
        if (live.current) setBusy(false)
      }
    }
  }
  return <section className="storage-panel" aria-labelledby="google-connection-title">
    <h2 id="google-connection-title">Google connection</h2>
    <p>Connect the Google account with the same email as your app account. Gmail read access is requested for future integration. Connecting does not enable scanning or send email to a model.</p>
    <p role="status">{busy ? "Checking Google connection…" : status ? `Status: ${status.state.replace(/_/g, " ")}${status.email ? ` · ${status.email}` : ""}` : "Connection status unavailable."}</p>
    <div className="storage-actions">
      <button disabled={busy || !status || status.state === "disconnecting"} onClick={() => void run("connect")}>{status?.state === "connected" || status?.state === "reconnect_required" ? "Reconnect Google" : "Connect Google"}</button>
      <button disabled={busy || status?.state !== "connected"} onClick={() => void run("check")}>Check token availability</button>
      <button disabled={busy || !status || status.state === "disconnected"} onClick={() => void run("disconnect")}>{status?.state === "disconnecting" ? "Retry disconnect" : "Disconnect Gmail"}</button>
      <button disabled={busy} onClick={() => void run("reload")}>Reload connection status</button>
    </div>
    <p>Scanning is disabled. Google Calendar is not connected. Signing out of the app does not disconnect Google.</p>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </section>
}
