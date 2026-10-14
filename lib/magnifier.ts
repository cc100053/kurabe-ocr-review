export function magnifierGeometry(
  width: number, height: number, naturalWidth: number, naturalHeight: number,
  x: number, y: number,
) {
  if (Math.min(width, height, naturalWidth, naturalHeight) <= 0) return null;
  const scale = Math.min(width / naturalWidth, height / naturalHeight);
  const imageWidth = naturalWidth * scale;
  const imageHeight = naturalHeight * scale;
  const offsetX = (width - imageWidth) / 2;
  const offsetY = (height - imageHeight) / 2;
  if (x < offsetX || x > offsetX + imageWidth || y < offsetY || y > offsetY + imageHeight) return null;
  const size = Math.min(160, width, height);
  return {
    x, y, size, imageWidth, imageHeight, offsetX, offsetY,
    left: Math.max(0, Math.min(width - size, x - size / 2)),
    top: Math.max(0, Math.min(height - size, y - size / 2)),
    imageLeft: size / 2 - (x - offsetX) * 3,
    imageTop: size / 2 - (y - offsetY) * 3,
  };
}
