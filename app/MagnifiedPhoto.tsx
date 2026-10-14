"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { magnifierGeometry } from "@/lib/magnifier";

export function MagnifiedPhoto({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [lens, setLens] = useState<ReturnType<typeof magnifierGeometry>>(null);

  useEffect(() => {
    const observer = new ResizeObserver(() => setLens(null));
    if (image.current) {
      observer.observe(image.current);
      setReady(image.current.complete && image.current.naturalWidth > 0);
    }
    return () => observer.disconnect();
  }, []);

  function locate(x?: number, y?: number) {
    const img = image.current;
    if (!img) return null;
    const box = img.getBoundingClientRect();
    return magnifierGeometry(box.width, box.height, img.naturalWidth, img.naturalHeight, x ?? box.width / 2, y ?? box.height / 2);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || (event.pointerType !== "mouse" && !event.buttons)) return;
    const box = image.current!.getBoundingClientRect();
    setLens(locate(event.clientX - box.left, event.clientY - box.top));
  }

  function keyMove(event: KeyboardEvent<HTMLDivElement>) {
    if (!enabled) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      setEnabled(false); setLens(null);
      return;
    }
    const steps: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
    const delta = steps[event.key];
    if (!delta) return;
    event.preventDefault(); event.stopPropagation();
    const current = lens ?? locate();
    if (current) setLens(locate(
      Math.max(current.offsetX, Math.min(current.offsetX + current.imageWidth, current.x + delta[0])),
      Math.max(current.offsetY, Math.min(current.offsetY + current.imageHeight, current.y + delta[1])),
    ));
  }

  return <div className={`photo-magnifier ${className}`}>
    <div className="photo-stage" role="group" tabIndex={enabled ? 0 : -1}
      aria-label={`${alt}；局部放大，方向鍵移動，Escape 關閉`}
      style={{ touchAction: enabled ? "none" : "auto", cursor: enabled ? "crosshair" : "default" }}
      onPointerMove={move} onPointerLeave={() => setLens(null)}
      onPointerDown={(event) => {
        if (enabled && event.pointerType !== "mouse") {
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event);
        }
      }}
      onPointerUp={(event) => { if (event.pointerType !== "mouse") setLens(null); }}
      onPointerCancel={() => setLens(null)} onKeyDown={keyMove}
      onFocus={() => { if (enabled) setLens(locate()); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} src={src} alt={alt} loading="lazy" draggable={false}
        onLoad={() => setReady(true)} onError={() => { setReady(false); setEnabled(false); setLens(null); }} />
      {enabled && lens && <div className="photo-lens" aria-hidden="true"
        style={{ width: lens.size, height: lens.size, left: lens.left, top: lens.top }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} style={{ position: "absolute", width: lens.imageWidth * 3, height: lens.imageHeight * 3,
          left: lens.imageLeft, top: lens.imageTop, maxWidth: "none", maxHeight: "none", border: 0, borderRadius: 0, transform: "none" }} />
      </div>}
    </div>
    <div className="photo-tools">
      <button type="button" aria-pressed={enabled} disabled={!ready}
        aria-label={`${alt}：放大鏡`}
        onClick={() => { setEnabled(!enabled); setLens(enabled ? null : locate()); }}>
        {enabled ? "關閉放大鏡" : "放大鏡 ×3"}
      </button>
      <a href={src} target="_blank" rel="noreferrer" aria-label={`${alt}：開原圖`}>原圖 ↗</a>
    </div>
    {enabled && <p className="photo-help muted">滑鼠移動／按住拖動放大；方向鍵移動，Esc 關閉。</p>}
  </div>;
}
