type ReviewExtraction = { needs_review?: boolean; warnings?: string[] }

export default function ExtractionReview({ extraction }: { extraction?: ReviewExtraction }) {
  if (!extraction?.needs_review) return null
  const reasons = [...new Set(extraction.warnings ?? [])]
  return <aside className="storage-review" aria-label="Needs review">
    <strong>Needs your verification</strong>
    <ul>{(reasons.length ? reasons : ["Verify the missing deadline and extracted details against the source."])
      .map((reason) => <li key={reason}>{reason}</li>)}</ul>
    <p>The classification is provisional. Check the supporting excerpt before accepting an action.</p>
  </aside>
}
