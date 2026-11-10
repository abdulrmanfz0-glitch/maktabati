import { describe, it, expect } from 'vitest';
import { extractPage, imageCoverage } from '../src/stages/extract.js';
import { encodePng, imageToChannels } from '../src/png.js';

const OPS = { save: 10, restore: 11, transform: 12, paintImageXObject: 85, paintInlineImageXObject: 86, paintImageMaskXObject: 83 };

// A fake pdf.js page: one bold item, one regular item, one image drawn at (100, 300) size 200x150.
function fakePage() {
  const img = { width: 2, height: 2, kind: 3, data: new Uint8ClampedArray(16).fill(200) };
  return {
    pageNumber: 4,
    view: [0, 0, 450, 600],
    async getTextContent() {
      return { items: [
        { str: 'عنوان', transform: [18, 0, 0, 18, 200, 500], width: 60, fontName: 'f1', dir: 'rtl' },
        { str: 'نص', transform: [13, 0, 0, 13, 150, 450], width: 30, fontName: 'f2', dir: 'rtl' },
        { str: '   ', transform: [13, 0, 0, 13, 10, 450], width: 5, fontName: 'f2', dir: 'ltr' }
      ] };
    },
    async getOperatorList() {
      return { fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore], argsArray: [[], [200, 0, 0, 150, 100, 300], ['img_p3_1'], []] };
    },
    commonObjs: { get(id) { if (id === 'f1') return { name: 'ABCDEF+Yakout-Bold' }; if (id === 'f2') return { name: 'GHIJKL+Yakout-Regular' }; throw new Error('no'); } },
    objs: { get(id, cb) { cb(id === 'img_p3_1' ? img : null); } }
  };
}

describe('extract', () => {
  it('reads items with geometry, font and weight', async () => {
    const p = await extractPage(fakePage(), OPS, {});
    expect(p.index).toBe(4);
    expect(p.items.length).toBe(2);
    expect(p.items[0]).toMatchObject({ s: 'عنوان', x: 200, y: 500, w: 60, size: 18, font: 'Yakout-Bold', bold: true, dir: 'rtl' });
    expect(p.items[1].bold).toBe(false);
  });
  it('tracks the CTM to place images and encodes pixels as PNG', async () => {
    const p = await extractPage(fakePage(), OPS, {});
    expect(p.images.length).toBe(1);
    expect(p.images[0]).toMatchObject({ x: 100, y: 300, w: 200, h: 150 });
    expect([...p.images[0].png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(imageCoverage(p)).toBeCloseTo((200 * 150) / (450 * 600));
  });
  it('can skip image pixels', async () => {
    const p = await extractPage(fakePage(), OPS, { images: false });
    expect(p.images[0].png).toBeUndefined();
  });
});

describe('png', () => {
  it('writes a valid header and IHDR', async () => {
    const png = await encodePng(3, 2, new Uint8Array(3 * 2 * 3).fill(9), 3);
    const dv = new DataView(png.buffer);
    expect(String.fromCharCode(...png.slice(12, 16))).toBe('IHDR');
    expect(dv.getUint32(16)).toBe(3);
    expect(dv.getUint32(20)).toBe(2);
    expect(png[25]).toBe(2); // RGB
    expect(String.fromCharCode(...png.slice(png.length - 8, png.length - 4))).toBe('IEND');
  });
  it('expands 1-bit images to gray', () => {
    const r = imageToChannels({ width: 8, height: 1, kind: 1, data: new Uint8Array([0b10100000]) });
    expect(r.channels).toBe(1);
    expect([...r.data.slice(0, 4)]).toEqual([255, 0, 255, 0]);
  });
});
