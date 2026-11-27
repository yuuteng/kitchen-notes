/**
 * Client-side photo compression. The original file never leaves the device:
 * we upload a ~300 KB full image and a small thumbnail for lists.
 */

const FULL_EDGE = 1600;
const THUMB_EDGE = 480;
const FULL_TARGET_BYTES = 300 * 1024;
const THUMB_TARGET_BYTES = 60 * 1024;

type Source = ImageBitmap | HTMLImageElement;

async function decode(file: Blob): Promise<Source> {
  // createImageBitmap applies the EXIF rotation, so phone photos do not come out sideways.
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img>, which decodes a few formats createImageBitmap rejects */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sizeOf = (s: Source) => ('naturalWidth' in s ? { w: s.naturalWidth, h: s.naturalHeight } : { w: s.width, h: s.height });

function draw(source: Source, maxEdge: number): HTMLCanvasElement {
  const { w, h } = sizeOf(source);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持图片处理');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片压缩失败'))), type, quality));

/** Encode under a byte budget: lower quality first, then shrink dimensions. */
async function encode(source: Source, maxEdge: number, targetBytes: number): Promise<Blob> {
  let edge = maxEdge;
  let best: Blob | null = null;
  for (let pass = 0; pass < 4; pass++) {
    const canvas = draw(source, edge);
    // Browsers without WebP encoding silently return PNG; detect that and use JPEG instead.
    const probe = await toBlob(canvas, 'image/webp', 0.82);
    const type = probe.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const blob = quality === 0.82 && type === 'image/webp' ? probe : await toBlob(canvas, type, quality);
      best = blob;
      if (blob.size <= targetBytes) return blob;
    }
    edge = Math.round(edge * 0.8);
  }
  return best as Blob;
}

export interface CompressedPhoto {
  full: Blob;
  thumb: Blob;
}

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) throw new Error('请选择图片文件');
  let source: Source;
  try {
    source = await decode(file);
  } catch {
    throw new Error('这张图片读取不了，换一张试试（部分浏览器不支持 HEIC 格式）');
  }
  try {
    const full = await encode(source, FULL_EDGE, FULL_TARGET_BYTES);
    const thumb = await encode(source, THUMB_EDGE, THUMB_TARGET_BYTES);
    return { full, thumb };
  } finally {
    if ('close' in source) source.close();
  }
}
