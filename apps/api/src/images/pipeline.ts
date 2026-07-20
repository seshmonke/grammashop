import sharp from "sharp";

// Пайплайн фото товара (см. STACK.md#пайплайн-фото-товара-спринт-16):
// валидация MIME + защита от decompression bomb, ресайз оригинала и
// thumbnail в webp. Чистые функции над буфером — без S3/БД, ownership и
// хранение живут в services/product-images.service.ts.

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

// Отсекает файл с честным малым весом, но сфабрикованными огромными
// исходными размерами — до полного декодирования, не после.
export const MAX_INPUT_PIXELS = 50_000_000;

export const ORIGINAL_MAX_SIDE = 1600;
export const THUMBNAIL_MAX_SIDE = 400;

export class UnsupportedImageTypeError extends Error {
  constructor(mimetype: string) {
    super(`неподдерживаемый тип файла: ${mimetype}`);
    this.name = "UnsupportedImageTypeError";
  }
}

export class ImageTooLargeError extends Error {
  constructor() {
    super("исходное изображение превышает допустимое разрешение");
    this.name = "ImageTooLargeError";
  }
}

export type ProcessedImage = {
  original: Buffer;
  thumbnail: Buffer;
};

function isAllowedMimeType(
  mimetype: string,
): mimetype is (typeof ALLOWED_MIME_TYPES)[number] {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimetype);
}

async function resizeToWebp(buffer: Buffer, maxSide: number): Promise<Buffer> {
  return sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: maxSide,
      height: maxSide,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer();
}

export async function processProductImage(
  buffer: Buffer,
  mimetype: string,
): Promise<ProcessedImage> {
  if (!isAllowedMimeType(mimetype)) {
    throw new UnsupportedImageTypeError(mimetype);
  }

  try {
    const [original, thumbnail] = await Promise.all([
      resizeToWebp(buffer, ORIGINAL_MAX_SIDE),
      resizeToWebp(buffer, THUMBNAIL_MAX_SIDE),
    ]);
    return { original, thumbnail };
  } catch (err) {
    // sharp бросает при превышении limitInputPixels — единственная
    // причина падения на валидном MIME-типе на этом шаге.
    throw new ImageTooLargeError();
  }
}
