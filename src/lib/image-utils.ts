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
