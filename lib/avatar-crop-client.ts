export type AvatarCropState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_AVATAR_CROP: AvatarCropState = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    image.src = url;
  });
}

export async function renderAvatarBlob(
  image: HTMLImageElement,
  crop: AvatarCropState,
  outputSize = 256,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  ctx.clearRect(0, 0, outputSize, outputSize);
  ctx.beginPath();
  ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const baseScale = Math.max(outputSize / image.width, outputSize / image.height);
  const scale = baseScale * crop.zoom;
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const x = (outputSize - drawW) / 2 + crop.offsetX;
  const y = (outputSize - drawH) / 2 + crop.offsetY;
  ctx.drawImage(image, x, y, drawW, drawH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("avatar_export_failed"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.9,
    );
  });
}
