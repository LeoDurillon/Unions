// Turns a drawn diagram's SVG into files to download: the SVG itself, or a PNG at twice its size.
const PNG_SCALE = 2;
const BACKGROUND = 'white';

export type Size = { width: number; height: number };

const ROOT_TAG = /<svg\b[^>]*>/u;
/** Where the size sits in a `viewBox`: `minX minY width height`. */
const BOX_WIDTH = 2;
const BOX_HEIGHT = 3;

/** The size the diagram's `viewBox` gives it; null when the SVG has none. */
export function svgSize(svg: string): Size | null {
  const tag = ROOT_TAG.exec(svg)?.[0] ?? '';
  const box = /viewBox="(?<box>[^"]+)"/u.exec(tag)?.groups?.box;
  const values = (box ?? '')
    .trim()
    .split(/[\s,]+/u)
    .map(Number);
  const width = values.at(BOX_WIDTH);
  const height = values.at(BOX_HEIGHT);
  return width && height ? { width, height } : null;
}

/**
 * The SVG as a file: its own pixel size (Mermaid sizes it to its container), on a white background
 * so it reads on a dark page too.
 */
export function standaloneSvg(svg: string, size: Size): string {
  return svg.replace(ROOT_TAG, (tag) =>
    tag
      .replaceAll(/\s(?:width|height)="[^"]*"/gu, '')
      .replace(/\sstyle="[^"]*"/u, '')
      .replace(
        /^<svg/u,
        `<svg width="${size.width}" height="${size.height}" style="background-color: ${BACKGROUND}"`,
      ),
  );
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** The SVG drawn on a canvas at `PNG_SCALE`, on a white background. */
export async function pngBlob(svg: string, size: Size): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(size.width * PNG_SCALE);
    canvas.height = Math.ceil(size.height * PNG_SCALE);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('This browser cannot draw the image');
    }
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('The image could not be made'));
        }
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Has the browser save `blob` as `name`. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
