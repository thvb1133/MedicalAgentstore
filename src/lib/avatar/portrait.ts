/**
 * Turning an uploaded photograph into an avatar.
 *
 * Everything here runs in the browser and the result is stored in
 * localStorage. A face is biometric data, it is often a photograph of someone
 * other than the person uploading it, and this application has no business
 * holding either. Not uploading it is not a limitation to work around — it is
 * the design.
 *
 * The image is squared, scaled down and re-encoded before it is stored, which
 * matters for three reasons. A phone photograph is several megabytes and
 * localStorage gives you around five, so the raw file would fail to save. The
 * re-encode drops the EXIF block, which on a phone photograph carries the GPS
 * coordinates where it was taken. And a fixed square is what the circular
 * portrait frame expects.
 */

/** Stored square size. Large enough for a retina 300px frame, small enough to fit. */
export const PORTRAIT_SIZE = 384;

/** Refuse anything that would not fit in storage even after re-encoding. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface PortraitError {
  message: string;
}

export function validateFile(file: File): PortraitError | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { message: "Use a JPEG, PNG or WebP image." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { message: "That image is larger than 12 MB. Try a smaller one." };
  }
  return null;
}

/**
 * Centre-crop to a square.
 *
 * A portrait taken on a phone is 3:4 and the face sits in the upper half, so
 * a centred crop of a tall image takes the chin off. Biasing the crop window
 * upward on portrait-orientation images keeps the face in frame without
 * needing face detection for what is a one-off cosmetic choice.
 */
export function cropBox(width: number, height: number) {
  const size = Math.min(width, height);
  const x = (width - size) / 2;
  const tall = height > width;
  const y = tall ? Math.min((height - size) / 2, height * 0.08) : (height - size) / 2;
  return { x, y, size };
}

/**
 * Read a file into a square data URL.
 *
 * Returns WebP where the browser supports it and JPEG otherwise; both are
 * dramatically smaller than a re-encoded PNG, and a PNG of a photograph would
 * blow the storage quota on its own.
 */
export async function fileToPortrait(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const { x, y, size } = cropBox(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = PORTRAIT_SIZE;
    canvas.height = PORTRAIT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process the image.");

    ctx.drawImage(bitmap, x, y, size, size, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);

    const webp = canvas.toDataURL("image/webp", 0.82);
    // Browsers that cannot encode WebP silently hand back a PNG data URL.
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}

const STORAGE_KEY = "sanjivani-setu.portrait.v1";

export function loadPortrait(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

export function savePortrait(dataUrl: string | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (dataUrl === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, dataUrl);
    }
    return true;
  } catch {
    // Quota exceeded, or private browsing. The caller says so rather than
    // leaving the person with a picture that vanishes on reload.
    return false;
  }
}
