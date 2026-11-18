// Shared pieces of the designed product UI, used by onboarding, settings and the dashboard.
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react"

export function Icon({
  name,
  size = 18,
}: {
  name: "calendar" | "check" | "close" | "more" | "external" | "arrow" | "clock" | "refresh"
  size?: number
}) {
  const paths = {
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    more: (
      <>
        <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7" />
        <path d="m10 14 11-11" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      </>
    ),
    arrow: <path d="m15 18-6-6 6-6" />,
    refresh: (
      <>
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 4v7h-7" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  )
}

export function Modal({
  children,
  onClose,
  title,
  wide = false,
  className = "",
  subtitle,
}: {
  children: ReactNode
  onClose: () => void
  title: string
  wide?: boolean
  className?: string
  // Optional line under the title, read with the dialog's name.
  subtitle?: string
}) {
  const subtitleId = useId()
  const dialog = useRef<HTMLElement>(null)
  // Keyboard focus follows the dialog: it moves in when the dialog opens (unless a field
  // inside already took it), Tab stays inside while it is open, and focus returns to
  // where it was when it closes. Without this, Tab kept walking the page underneath.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog.current && !dialog.current.contains(document.activeElement)) dialog.current.focus()
    return () => { if (opener?.isConnected) opener.focus() }
  }, [])
  const keepFocusInside = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !dialog.current) return
    const items = [...dialog.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    )].filter((item) => item.offsetParent !== null)
    if (!items.length) { event.preventDefault(); return }
    const first = items[0], last = items[items.length - 1], active = document.activeElement
    if (event.shiftKey && (active === first || active === dialog.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
  }
  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-label={title}
        aria-describedby={subtitle ? subtitleId : undefined}
        aria-modal="true"
        className={`modal ${wide ? "modal-wide" : ""} ${className}`.trim()}
        role="dialog"
        ref={dialog}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">InboxToTask</span>
            <h2>{title}</h2>
            {subtitle && <p className="modal-subtitle" id={subtitleId}>{subtitle}</p>}
          </div>
          <button aria-label="Close" className="icon-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
