import { getGoogleDriveDirectLink } from './imageUtils';

export class OverlayCache {
    private static cache: Map<string, HTMLImageElement> = new Map();

    static async preloadOverlay(driveId: string): Promise<HTMLImageElement> {
        if (this.cache.has(driveId)) {
            return this.cache.get(driveId)!;
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                this.cache.set(driveId, img);
                resolve(img);
            };
            img.onerror = (err) => reject(err);
            img.src = getGoogleDriveDirectLink(driveId);
        });
    }

    static getOverlay(driveId: string): HTMLImageElement | undefined {
        return this.cache.get(driveId);
    }
}
