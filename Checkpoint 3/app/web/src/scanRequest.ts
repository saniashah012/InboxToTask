// Which scan request to send, as a pure rule so it can be tested offline.
//
// A saved backlog is continued ("more"). The backend refuses to continue it once
// the Gmail connection was reconnected or the scan settings or storage changed
// after that check stopped, and it answers with the same code it uses for a
// real permission problem. A new check ("initial") is what the user needs then,
// so the request is retried once as "initial". That retry passes every server
// check again: if it is refused too, the problem is real and its error is
// shown. It never retries more than once.

export type ScanMode = "initial" | "more"

export const SCAN_REFUSED_CODE = "SCAN_PERMISSION_OR_REVISION_CHANGED"

export type ScanAttempt<T> = {
  result: T
  // The mode that produced the result.
  mode: ScanMode
  // True when a refused continuation was replaced by a new check.
  restarted: boolean
}

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : ""

// Whether a failed request should be retried once as a new check.
export function shouldStartFresh(mode: ScanMode, error: unknown): boolean {
  return mode === "more" && errorCode(error) === SCAN_REFUSED_CODE
}

export async function requestScan<T>(mode: ScanMode, send: (mode: ScanMode) => Promise<T>): Promise<ScanAttempt<T>> {
  try {
    return { result: await send(mode), mode, restarted: false }
  } catch (error) {
    if (!shouldStartFresh(mode, error)) throw error
  }
  return { result: await send("initial"), mode: "initial", restarted: true }
}
