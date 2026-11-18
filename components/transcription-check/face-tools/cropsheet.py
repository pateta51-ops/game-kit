"""One contact sheet of the same crop of many face or art images, with a labelled grid, to check by eye.

    python cropsheet.py --out sheet.png --crop 0.2,0.1,0.6,0.4 [--cols 8] [--thumb 300] [--grid 0.05] [--label name] IMAGE...

--crop is the crop box as fractions of each image (x0,y0,x1,y1): a head, a side edge, a name line. Each tile is the crop
scaled to --thumb px wide, with a grid line every --grid of the crop (every second line red) and its label (the file's
stem, or its index with --label index) below. `crop_sheet` is the same as a function (list of (label, PIL image)).
"""
import argparse
import os

from PIL import Image, ImageDraw


def crop_sheet(items, crop, cols=8, thumb=300, grid=0.05, label_h=16):
    x0f, y0f, x1f, y1f = crop
    ratio = (y1f - y0f) / (x1f - x0f) * (items[0][1].height / items[0][1].width)
    tw, th = thumb, max(1, int(round(thumb * ratio)))
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (tw * cols, (th + label_h) * rows), 'white')
    d = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(items):
        w, h = im.size
        tile = im.convert('RGB').crop((round(x0f * w), round(y0f * h), round(x1f * w), round(y1f * h))).resize((tw, th))
        x, y = (i % cols) * tw, (i // cols) * (th + label_h)
        sheet.paste(tile, (x, y))
        td = ImageDraw.Draw(sheet)
        n = 1
        while grid > 0 and n * grid < 1 - 1e-9:
            colour = 'red' if n % 2 == 0 else 'blue'
            gx, gy = x + int(tw * n * grid), y + int(th * n * grid)
            td.line((gx, y, gx, y + th), fill=colour)
            td.line((x, gy, x + tw, gy), fill=colour)
            n += 1
        d.text((x + 2, y + th + 2), str(label), fill='black')
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('images', nargs='+')
    ap.add_argument('--out', required=True)
    ap.add_argument('--crop', required=True)
    ap.add_argument('--cols', type=int, default=8)
    ap.add_argument('--thumb', type=int, default=300)
    ap.add_argument('--grid', type=float, default=0.05)
    ap.add_argument('--label', default='name', choices=['name', 'index'])
    a = ap.parse_args()
    items = [(os.path.splitext(os.path.basename(p))[0] if a.label == 'name' else i, Image.open(p)) for i, p in enumerate(a.images)]
    crop_sheet(items, tuple(float(v) for v in a.crop.split(',')), a.cols, a.thumb, a.grid).save(a.out)
    print(len(items))


if __name__ == '__main__':
    main()
