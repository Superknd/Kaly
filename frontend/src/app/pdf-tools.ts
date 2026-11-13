import { Injectable } from '@angular/core';

export interface PdfPageThumbnail {
  pageNumber: number;
  previewUrl: string;
  rotation: number;
}

@Injectable({ providedIn: 'root' })
export class PdfTools {
  async merge(files: File[]): Promise<Blob> {
    const { PDFDocument, degrees } = await import('pdf-lib');
    const output = await PDFDocument.create();
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const name = file.name.toLowerCase();
      if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
        const input = await PDFDocument.load(bytes);
        const pages = await output.copyPages(input, input.getPageIndices());
        pages.forEach(page => output.addPage(page));
      } else if (file.type === 'image/jpeg' || /\.(jpe?g)$/.test(name)) {
        this.addImagePage(output, await output.embedJpg(bytes), 0, degrees);
      } else if (file.type === 'image/png' || name.endsWith('.png')) {
        this.addImagePage(output, await output.embedPng(bytes), 0, degrees);
      } else {
        throw new Error(`Le format de « ${file.name} » n’est pas pris en charge.`);
      }
    }
    return this.toBlob(await output.save({ useObjectStreams: true }));
  }

  async imagesToPdf(images: Blob[], rotations: number[] = []): Promise<Blob> {
    const { PDFDocument, degrees } = await import('pdf-lib');
    const output = await PDFDocument.create();
    for (const [index, imageBlob] of images.entries()) {
      const bytes = await imageBlob.arrayBuffer();
      const image = imageBlob.type === 'image/png'
        ? await output.embedPng(bytes)
        : await output.embedJpg(bytes);
      this.addImagePage(output, image, rotations[index] ?? 0, degrees);
    }
    return this.toBlob(await output.save({ useObjectStreams: true }));
  }

  async extractPages(file: Blob, range: string): Promise<Blob> {
    return this.copyPages(file, this.parsePageRange(range, await this.pageCount(file)));
  }

  async pageCount(file: Blob): Promise<number> {
    const { PDFDocument } = await import('pdf-lib');
    const source = await PDFDocument.load(await file.arrayBuffer());
    return source.getPageCount();
  }

  async editPages(file: Blob, pageNumbers: number[], rotations: number[]): Promise<Blob> {
    const { PDFDocument, degrees } = await import('pdf-lib');
    const source = await PDFDocument.load(await file.arrayBuffer());
    const result = await PDFDocument.create();
    const indices = pageNumbers.map(pageNumber => pageNumber - 1);
    if (indices.some(index => index < 0 || index >= source.getPageCount())) {
      throw new Error('Une page sélectionnée ne fait pas partie du document.');
    }
    const pages = await result.copyPages(source, indices);
    pages.forEach((page, index) => {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + (rotations[index] ?? 0)) % 360));
      result.addPage(page);
    });
    return this.toBlob(await result.save({ useObjectStreams: true }));
  }

  async split(file: Blob, ranges: string): Promise<Array<{ name: string; blob: Blob }>> {
    const pageCount = await this.pageCount(file);
    const parts = ranges.split(';').map(part => part.trim()).filter(Boolean);
    if (parts.length < 2) throw new Error('Indiquez au moins deux plages séparées par un point-virgule.');
    if (parts.length > 20) throw new Error('La division est limitée à 20 fichiers.');
    const outputs: Array<{ name: string; blob: Blob }> = [];
    for (const [index, range] of parts.entries()) {
      outputs.push({
        name: `partie-${index + 1}.pdf`,
        blob: await this.copyPages(file, this.parsePageRange(range, pageCount))
      });
    }
    return outputs;
  }

  async optimize(file: Blob): Promise<Blob> {
    const { PDFDocument } = await import('pdf-lib');
    const document = await PDFDocument.load(await file.arrayBuffer());
    const optimized = await document.save({ useObjectStreams: true, objectsPerTick: 50 });
    if (optimized.byteLength >= file.size) return file;
    return this.toBlob(optimized);
  }

  async renderPdfPages(file: Blob, range: string, scale = 1): Promise<PdfPageThumbnail[]> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await loadingTask.promise;
    const pageNumbers = this.parsePageRange(range, pdf.numPages);
    if (pageNumbers.length > 50) {
      await loadingTask.destroy();
      throw new Error('L’aperçu est limité à 50 pages à la fois.');
    }
    const previews: PdfPageThumbnail[] = [];
    try {
      for (const pageIndex of pageNumbers) {
        const page = await pdf.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Impossible de préparer l’aperçu du PDF.');
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        previews.push({ pageNumber: pageIndex + 1, previewUrl: canvas.toDataURL('image/jpeg', 0.75), rotation: 0 });
        page.cleanup();
      }
    } finally {
      await loadingTask.destroy();
    }
    return previews;
  }

  async compress(file: Blob): Promise<Blob> {
    const { PDFDocument } = await import('pdf-lib');
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const source = await loadingTask.promise;
    if (source.numPages > 100) {
      await loadingTask.destroy();
      throw new Error('La compression navigateur est limitée à 100 pages.');
    }

    const output = await PDFDocument.create();
    try {
      for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber++) {
        const sourcePage = await source.getPage(pageNumber);
        const originalViewport = sourcePage.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 1600 / Math.max(originalViewport.width, originalViewport.height));
        const viewport = sourcePage.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Impossible de préparer la compression du PDF.');
        await sourcePage.render({ canvas, canvasContext: context, viewport }).promise;
        const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.62));
        if (!jpeg) throw new Error(`Impossible de compresser la page ${pageNumber}.`);
        const image = await output.embedJpg(await jpeg.arrayBuffer());
        const outputPage = output.addPage([originalViewport.width, originalViewport.height]);
        outputPage.drawImage(image, {
          x: 0, y: 0, width: originalViewport.width, height: originalViewport.height
        });
        sourcePage.cleanup();
      }
    } finally {
      await loadingTask.destroy();
    }

    const compressed = this.toBlob(await output.save({ useObjectStreams: true }));
    return compressed.size < file.size ? compressed : file;
  }

  private async copyPages(file: Blob, pageIndices: number[]): Promise<Blob> {
    const { PDFDocument } = await import('pdf-lib');
    const source = await PDFDocument.load(await file.arrayBuffer());
    const result = await PDFDocument.create();
    const pages = await result.copyPages(source, pageIndices);
    pages.forEach(page => result.addPage(page));
    return this.toBlob(await result.save({ useObjectStreams: true }));
  }

  private addImagePage(
    document: import('pdf-lib').PDFDocument,
    image: import('pdf-lib').PDFImage,
    rotationDegrees: number,
    degrees: (angle: number) => import('pdf-lib').Rotation
  ): void {
    const maxWidth = 595.28;
    const maxHeight = 841.89;
    const angle = ((rotationDegrees % 360) + 360) % 360;
    const swapsAxes = angle === 90 || angle === 270;
    const sourceWidth = swapsAxes ? image.height : image.width;
    const sourceHeight = swapsAxes ? image.width : image.height;
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const pageWidth = swapsAxes ? height : width;
    const pageHeight = swapsAxes ? width : height;
    const page = document.addPage([pageWidth, pageHeight]);
    page.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
      rotate: degrees(angle)
    });
  }

  private parsePageRange(range: string, pageCount: number): number[] {
    const pages = new Set<number>();
    for (const rawPart of range.split(',')) {
      const part = rawPart.trim();
      const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
      if (!match) throw new Error(`Plage de pages invalide : « ${part} ». Exemple accepté : 1, 3-5.`);
      const start = Number(match[1]);
      const end = Number(match[2] ?? match[1]);
      if (start < 1 || end < start || end > pageCount) {
        throw new Error(`Les pages doivent être comprises entre 1 et ${pageCount}.`);
      }
      for (let page = start; page <= end; page++) pages.add(page - 1);
    }
    if (pages.size === 0) throw new Error('Indiquez au moins une page à extraire.');
    return [...pages].sort((a, b) => a - b);
  }

  private toBlob(bytes: Uint8Array): Blob {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: 'application/pdf' });
  }
}
