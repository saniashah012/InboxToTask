import { useCallback, useEffect, useRef, useState } from "react"
import {
  endVisit, initialState, isNew, loadNewItems, markSeen, saveNewItems, VISIT_MS,
  type NewItemsState, type NewItemsTab,
} from "./newItems"

type Card = { key?: string; createdAt: string | null | undefined }

// Tracks visits to the Suggestions view ("review") and Passive communication ("passive").
// A visit that lasted at least VISIT_MS ends when the tab stops being shown, the page is
// hidden or closed, or the dashboard unmounts. Ending it clears that tab's "New" marks.
export function useNewItems({ userId, loaded, review, passive, showing }: {
  userId: string
  loaded: boolean
  review: Card[]
  passive: Card[]
  showing: NewItemsTab | null
}) {
  const [state, setState] = useState<NewItemsState | null>(() => loadNewItems(userId))
  const latestState = useRef(state)
  const shown = useRef({ review, passive })
  shown.current = { review, passive }

  const update = useCallback((change: (s: NewItemsState) => NewItemsState) => {
    const current = latestState.current
    if (!current) return
    const next = change(current)
    if (next === current) return
    latestState.current = next
    setState(next)
    saveNewItems(userId, next)
  }, [userId])

  // First load in this browser: what is already there is not new.
  useEffect(() => {
    if (!loaded || latestState.current) return
    const first = initialState(
      review.flatMap((c) => (c.key ? [c.key] : [])),
      review.map((c) => c.createdAt),
      passive.map((c) => c.createdAt),
    )
    latestState.current = first
    setState(first)
    saveNewItems(userId, first)
  }, [loaded, review, passive, userId])

  useEffect(() => {
    if (!showing || !loaded) return
    let started = document.visibilityState === "visible" ? Date.now() : null
    const finish = () => {
      if (started !== null && Date.now() - started >= VISIT_MS) {
        update((s) => endVisit(s, showing, shown.current[showing].map((c) => c.createdAt)))
      }
      started = null
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") finish()
      else started = Date.now()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", finish)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", finish)
      finish()
    }
  }, [showing, loaded, update])

  return {
    ready: state !== null,
    isNew: (tab: NewItemsTab, createdAt: string | null | undefined) => state !== null && isNew(createdAt, state[tab]),
    isUnread: (key: string) => state !== null && !state.seen.includes(key),
    lastVisit: (tab: NewItemsTab) => state?.[tab] ?? null,
    markSeen: (key: string) => update((s) => markSeen(s, key)),
  }
}
