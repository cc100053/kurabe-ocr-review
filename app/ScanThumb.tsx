// Renders the scanned price-tag image so a reviewer can eyeball the original.
// The image is linked to the scan heuristically (nearest same-user price_record
// by time) in the SQL views, so it can legitimately be missing — show a dash.
// Plain <img> (public bucket, internal console); next/image would need remote
// domain config for no real benefit here.
export function ScanThumb({ url }: { url: string | null }) {
  if (!url) return <span className="muted">—</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open full image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="scanned price tag" className="scan-thumb" loading="lazy" />
    </a>
  );
}
