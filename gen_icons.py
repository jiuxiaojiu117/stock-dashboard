#!/usr/bin/env python3
# 生成 PWA 应用图标（纯标准库，无第三方依赖）
import struct, zlib, math, os

def lerp(a, b, t):
    return int(a + (b - a) * t)

def make_icon(size, rounded, mask_safe):
    W = size
    c1 = (251, 113, 133)   # #fb7185
    c2 = (225, 29, 72)     # #e11d48
    cx, cy = W / 2, W / 2
    r = 0.34 * W
    rad = 0.22 * W if rounded else 0
    px = bytearray()
    for y in range(W):
        px.append(0)  # filter byte (0) for this scanline
        for x in range(W):
            # 渐变背景（对角线）
            t = (x + y) / (2 * W)
            R = lerp(c1[0], c2[0], t)
            G = lerp(c1[1], c2[1], t)
            B = lerp(c1[2], c2[2], t)
            A = 255
            # 圆角裁剪
            if rad:
                # 四角圆角：仅当像素落在任一“角矩形”内且到角圆心的距离 > rad 时透明
                corners = [(rad, rad), (W - rad, rad), (rad, W - rad), (W - rad, W - rad)]
                outside = False
                for (ccx, ccy) in corners:
                    in_corner = ((x < ccx and y < ccy) or (x > ccx and y < ccy)
                                 or (x < ccx and y > ccy) or (x > ccx and y > ccy))
                    if in_corner and math.hypot(x - ccx, y - ccy) > rad:
                        outside = True
                        break
                if outside:
                    A = 0
            # 白色向上箭头
            white = False
            # 箭头头部（三角形）
            apex_y = cy - 0.17 * W
            base_y = cy + 0.02 * W
            half_top = 0.005 * W
            half_base = 0.14 * W
            if base_y >= y >= apex_y:
                f = (base_y - y) / (base_y - apex_y)
                half = half_top + (half_base - half_top) * f
                if abs(x - cx) <= half:
                    white = True
            # 箭头杆（矩形）
            stem_w = 0.05 * W
            if base_y <= y <= cy + 0.21 * W and abs(x - cx) <= stem_w:
                white = True
            if white:
                R, G, B, A = 255, 255, 255, 255
            px.extend((R, G, B, A))
    return bytes(px)

def png_chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

def write_png(path, size, rounded):
    raw = make_icon(size, rounded, False)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    with open(path, 'wb') as f:
        f.write(sig)
        f.write(png_chunk(b'IHDR', ihdr))
        f.write(png_chunk(b'IDAT', idat))
        f.write(png_chunk(b'IEND', b''))

base = os.path.dirname(os.path.abspath(__file__))
write_png(os.path.join(base, 'icon-192.png'), 192, True)
write_png(os.path.join(base, 'icon-512.png'), 512, True)
write_png(os.path.join(base, 'icon-maskable-512.png'), 512, False)
print('icons generated: icon-192.png, icon-512.png, icon-maskable-512.png')
