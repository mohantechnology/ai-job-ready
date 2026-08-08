// Compresses an arbitrary image Blob (e.g. a whiteboard export) down to a
// JPEG data URL under a target byte size, for two consumers with the same
// requirement - small enough to be cheap to send over the OpenAI Realtime
// data channel and to store in Postgres, while still staying legible enough
// for the model to actually read what was drawn (diagram labels, arrows,
// handwriting, etc).
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // hard cap: always under 2MB
const DEFAULT_MAX_DIMENSION = 1600; // px, long edge

function dataUrlSizeBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  // Base64 encodes 3 bytes as 4 chars; padding chars ('=') don't count.
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export async function compressImageToJpegDataUrl(
  blob,
  { maxBytes = DEFAULT_MAX_BYTES, maxDimension = DEFAULT_MAX_DIMENSION } = {}
) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  let width = Math.max(1, Math.round(bitmap.width * scale));
  let height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const drawAt = (w, h) => {
    canvas.width = w;
    canvas.height = h;
    // Excalidraw exports have a transparent background; flatten onto white
    // first since JPEG has no alpha channel (transparent would render black).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
  };

  drawAt(width, height);

  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  let sizeBytes = dataUrlSizeBytes(dataUrl);

  // Back off quality first (cheaper on legibility than shrinking).
  while (sizeBytes > maxBytes && quality > 0.35) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    sizeBytes = dataUrlSizeBytes(dataUrl);
  }

  // If still too big (e.g. a very large/dense canvas), shrink dimensions too.
  while (sizeBytes > maxBytes && Math.max(width, height) > 480) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    drawAt(width, height);
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    sizeBytes = dataUrlSizeBytes(dataUrl);
  }

  bitmap.close?.();
  return { dataUrl, sizeBytes, width, height };
}
