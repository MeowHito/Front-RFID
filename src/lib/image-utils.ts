/**
 * Compress an image file to fit within maxSizeBytes.
 * Progressively reduces quality and dimensions until the result is small enough.
 * Returns a base64 data URL (JPEG).
 */
export function compressImage(
    file: File,
    maxSizeBytes = 5 * 1024 * 1024,
    maxDimension = 2400,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const tryCompress = (scale: number, quality: number): string => {
                    const w = Math.round(img.width * scale);
                    const h = Math.round(img.height * scale);
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Canvas not supported');
                    ctx.drawImage(img, 0, 0, w, h);
                    return canvas.toDataURL('image/jpeg', quality);
                };

                // Calculate initial scale to fit maxDimension
                let scale = 1;
                if (img.width > maxDimension || img.height > maxDimension) {
                    scale = maxDimension / Math.max(img.width, img.height);
                }

                // Try progressively lower quality/scale
                const qualities = [0.85, 0.7, 0.5, 0.35];
                for (const q of qualities) {
                    const dataUrl = tryCompress(scale, q);
                    // Rough size estimate: base64 is ~4/3 of binary
                    const estimatedBytes = (dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75;
                    if (estimatedBytes <= maxSizeBytes) {
                        resolve(dataUrl);
                        return;
                    }
                    // Reduce scale for next attempt
                    scale *= 0.75;
                }

                // Final attempt at minimum settings
                resolve(tryCompress(scale, 0.3));
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Crop and resize an image to a fixed 16:8 (2:1) aspect ratio using canvas.
 * Returns a base64 data URL of the cropped image.
 */
export function cropImageTo16x8(file: File, maxWidth = 1200): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const targetRatio = 2; // 16:8 = 2:1
                const imgRatio = img.width / img.height;

                let sx = 0, sy = 0, sw = img.width, sh = img.height;

                if (imgRatio > targetRatio) {
                    // Image is wider than 2:1 — crop sides
                    sw = img.height * targetRatio;
                    sx = (img.width - sw) / 2;
                } else {
                    // Image is taller than 2:1 — crop top/bottom
                    sh = img.width / targetRatio;
                    sy = (img.height - sh) / 2;
                }

                // Output dimensions
                const outW = Math.min(sw, maxWidth);
                const outH = outW / targetRatio;

                const canvas = document.createElement('canvas');
                canvas.width = outW;
                canvas.height = outH;

                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Canvas not supported'));

                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

                // Export as JPEG for smaller file size
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}
