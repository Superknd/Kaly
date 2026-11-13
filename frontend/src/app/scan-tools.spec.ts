import { orderDocumentCorners } from './scan-tools';

describe('orderDocumentCorners', () => {
  it('orders a skewed page clockwise from its top-left corner', () => {
    const corners = [
      { x: 80, y: 120 },
      { x: 590, y: 70 },
      { x: 650, y: 880 },
      { x: 30, y: 820 }
    ];

    expect(orderDocumentCorners(corners)).toEqual([
      { x: 80, y: 120 },
      { x: 590, y: 70 },
      { x: 650, y: 880 },
      { x: 30, y: 820 }
    ]);
  });

  it('rejects point sets that cannot define four distinct corners', () => {
    expect(orderDocumentCorners([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
    expect(orderDocumentCorners([{ x: 0, y: 0 }])).toBeNull();
  });
});
