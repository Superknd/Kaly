import { PDFDocument } from 'pdf-lib';
import { PdfTools } from './pdf-tools';

async function createPdfFile(name: string, pageCount: number): Promise<File> {
  const document = await PDFDocument.create();
  for (let page = 0; page < pageCount; page++) document.addPage();
  const bytes = await document.save();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], name, { type: 'application/pdf' });
}

describe('PdfTools', () => {
  const tools = new PdfTools();

  it('merges PDF documents in the supplied order', async () => {
    const first = await createPdfFile('first.pdf', 2);
    const second = await createPdfFile('second.pdf', 1);

    const merged = await tools.merge([first, second]);
    const result = await PDFDocument.load(await merged.arrayBuffer());

    expect(merged.type).toBe('application/pdf');
    expect(result.getPageCount()).toBe(3);
  });

  it('extracts selected pages and removes duplicate page numbers', async () => {
    const source = await createPdfFile('source.pdf', 4);

    const extracted = await tools.extractPages(source, '2-3, 2');
    const result = await PDFDocument.load(await extracted.arrayBuffer());

    expect(result.getPageCount()).toBe(2);
  });

  it('rejects invalid page ranges', async () => {
    const source = await createPdfFile('source.pdf', 2);

    await expect(tools.extractPages(source, '1-4')).rejects.toThrow('comprises entre 1 et 2');
  });
});
