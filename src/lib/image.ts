"use client";

/**
 * Turns an uploaded image into a small square data URL.
 *
 * Item icons are stored inline in the database rather than in a separate blob
 * store, so they are downscaled and re-encoded here: a 96px WebP is a couple of
 * kilobytes, which keeps a full item catalogue well inside a comfortable row
 * size and removes an entire piece of infrastructure from the deploy.
 */
export async function fileToIconDataUrl(file: File, size = 96): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file is not an image.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("That image is larger than 8 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read the image.");

  // Cover-fit: crop the long edge rather than squashing the icon.
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close();

  const webp = canvas.toDataURL("image/webp", 0.9);
  // Safari versions without WebP encoding silently fall back to PNG.
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}
