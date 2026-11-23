from PIL import Image, ImageDraw
im = Image.new('RGBA', (240, 240), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.ellipse((6, 6, 233, 233), fill=(196, 52, 52, 255))
d.ellipse((30, 30, 209, 209), outline=(250, 230, 200, 255), width=8)
d.polygon([(120, 62), (136, 108), (184, 108), (146, 136), (160, 182), (120, 154), (80, 182), (94, 136), (56, 108), (104, 108)], fill=(250, 230, 200, 255))
im.save('token.webp', quality=95)
