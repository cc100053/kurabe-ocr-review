import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main>
      <h1>OCR Closed-Loop Review</h1>
      <p className="subtitle">
        Reads live telemetry from the Kurabe project via the three review views.
      </p>
      <ul>
        <li>
          <Link href="/confusion">Confusion summary</Link> — AI value vs final
          saved value per field; find recurring wrong→right pairs.
        </li>
        <li>
          <Link href="/correction-samples">Correction samples</Link> — raw
          user-change events with guard action / reason / evidence.
        </li>
        <li>
          <Link href="/suspicious">Suspicious untouched</Link> — risk-flagged by
          the guard but the user never changed it (silent-wrong blind spots).
        </li>
      </ul>
      <p className="note">
        Review questions per pass: which field has the highest correction rate?
        Same pattern or scattered? Prompt vs guard vs OCR ambiguity? Any
        high-risk untouched case? Fix prompt, add guard, or just add a test?
      </p>
    </main>
  );
}
