import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface VisualComparison {
  diffRatio: number;
  diffPixels: number;
  diffImage: Buffer;
  sizeMismatch: boolean;
}

/** Compares two PNG screenshots. Images of different sizes are compared over the overlapping area
 *  and the non-overlapping area counts as changed. */
export function compareScreenshots(baselineBuf: Buffer, currentBuf: Buffer, threshold = 0.1): VisualComparison {
  const a = PNG.sync.read(baselineBuf);
  const b = PNG.sync.read(currentBuf);
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const pad = (img: PNG) => {
    if (img.width === width && img.height === height) return img;
    const out = new PNG({ width, height });
    out.data.fill(0);
    PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
    return out;
  };
  const pa = pad(a);
  const pb = pad(b);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(pa.data, pb.data, diff.data, width, height, { threshold });
  return {
    diffPixels,
    diffRatio: diffPixels / (width * height),
    diffImage: PNG.sync.write(diff),
    sizeMismatch: a.width !== b.width || a.height !== b.height,
  };
}
