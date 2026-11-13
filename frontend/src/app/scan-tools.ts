import { Injectable } from '@angular/core';
import type { CV } from '@techstark/opencv-js';

export interface ScanPoint {
  x: number;
  y: number;
}

export function orderDocumentCorners(points: ScanPoint[]): ScanPoint[] | null {
  if (points.length !== 4 || new Set(points.map(point => `${point.x},${point.y}`)).size !== 4) return null;

  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 }
  );
  const sorted = [...points].sort((first, second) =>
    Math.atan2(first.y - center.y, first.x - center.x) -
    Math.atan2(second.y - center.y, second.x - center.x)
  );
  const topLeftIndex = sorted.reduce((bestIndex, point, index) =>
    point.x + point.y < sorted[bestIndex].x + sorted[bestIndex].y ? index : bestIndex, 0
  );
  const ordered = [...sorted.slice(topLeftIndex), ...sorted.slice(0, topLeftIndex)];
  const polygonArea = ordered.reduce((area, point, index) => {
    const next = ordered[(index + 1) % ordered.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
  return Math.abs(polygonArea) > 1 ? ordered : null;
}

@Injectable({ providedIn: 'root' })
export class ScanTools {
  private openCvPromise?: Promise<CV>;

  async cropDocument(image: Blob): Promise<Blob | null> {
    const bitmap = await createImageBitmap(image);
    try {
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const inputCanvas = document.createElement('canvas');
      inputCanvas.width = width;
      inputCanvas.height = height;
      const context = inputCanvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Impossible de préparer l’image pour le recadrage.');
      context.drawImage(bitmap, 0, 0, width, height);

      const cv = await this.loadOpenCv();
      const source = cv.matFromImageData(context.getImageData(0, 0, width, height));
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edges = new cv.Mat();
      const dilated = new cv.Mat();
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      let transform: InstanceType<typeof cv.Mat> | undefined;
      let sourcePoints: InstanceType<typeof cv.Mat> | undefined;
      let destinationPoints: InstanceType<typeof cv.Mat> | undefined;
      const warped = new cv.Mat();

      try {
        cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        cv.Canny(blurred, edges, 50, 150);
        cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2);
        cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        const minimumArea = width * height * 0.15;
        let bestArea = minimumArea;
        let bestCorners: ScanPoint[] | null = null;
        for (let index = 0; index < contours.size(); index++) {
          const contour = contours.get(index);
          const approximation = new cv.Mat();
          try {
            const perimeter = cv.arcLength(contour, true);
            cv.approxPolyDP(contour, approximation, perimeter * 0.02, true);
            if (approximation.rows !== 4 || !cv.isContourConvex(approximation)) continue;
            const area = cv.contourArea(approximation);
            if (area <= bestArea) continue;

            const coordinates = approximation.data32S;
            const ordered = orderDocumentCorners(Array.from({ length: 4 }, (_, pointIndex) => ({
              x: coordinates[pointIndex * 2],
              y: coordinates[pointIndex * 2 + 1]
            })));
            if (ordered) {
              bestArea = area;
              bestCorners = ordered;
            }
          } finally {
            contour.delete();
            approximation.delete();
          }
        }

        if (!bestCorners) return null;

        const [topLeft, topRight, bottomRight, bottomLeft] = bestCorners;
        const outputWidth = Math.round(Math.max(
          this.distance(topLeft, topRight),
          this.distance(bottomLeft, bottomRight)
        ));
        const outputHeight = Math.round(Math.max(
          this.distance(topLeft, bottomLeft),
          this.distance(topRight, bottomRight)
        ));
        if (outputWidth < 2 || outputHeight < 2) return null;

        sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, bestCorners.flatMap(point => [point.x, point.y]));
        destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0, outputWidth - 1, 0, outputWidth - 1, outputHeight - 1, 0, outputHeight - 1
        ]);
        transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
        cv.warpPerspective(source, warped, transform, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR);

        const outputCanvas = document.createElement('canvas');
        cv.imshow(outputCanvas, warped);
        const cropped = await new Promise<Blob | null>(resolve => outputCanvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!cropped) throw new Error('Impossible de créer l’image recadrée.');
        return cropped;
      } finally {
        source.delete();
        gray.delete();
        blurred.delete();
        edges.delete();
        dilated.delete();
        kernel.delete();
        contours.delete();
        hierarchy.delete();
        transform?.delete();
        sourcePoints?.delete();
        destinationPoints?.delete();
        warped.delete();
      }
    } finally {
      bitmap.close();
    }
  }

  private loadOpenCv(): Promise<CV> {
    if (!this.openCvPromise) {
      this.openCvPromise = new Promise<CV>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/assets/opencv/opencv.js';
        script.async = true;
        script.onload = () => {
          const module = cv as CV | Promise<CV>;
          if (module instanceof Promise) {
            void module.then(resolve, reject);
          } else if (module.Mat) {
            resolve(module);
          } else {
            (module as CV & { onRuntimeInitialized?: () => void }).onRuntimeInitialized = () => resolve(module);
          }
        };
        script.onerror = () => {
          script.remove();
          reject(new Error('Impossible de charger OpenCV pour le recadrage.'));
        };
        document.head.appendChild(script);
      });
    }
    return this.openCvPromise.catch(error => {
      this.openCvPromise = undefined;
      throw error;
    });
  }

  private distance(first: ScanPoint, second: ScanPoint): number {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }
}
