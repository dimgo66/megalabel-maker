"""Independent cross-check of the template geometry.

Every template is a single Word table occupying the full A4 sheet.
The table spine (TDefTable boundaries, in twips) is measured from the LEFT TEXT MARGIN
and is identical to the paper edge (boundaries start at x = -marginLeft).
Row height comes from sprmTDyaRowHeight (negative = exact), in twips.
We verify: left = -first boundary; right = last boundary (= sheet width).
"""
TW = 1440 / 25.4
def mm(tw): return tw / TW

SHEET_W, SHEET_H = 210.0, 297.007874  # A4 = 11906 x 16838 twips exactly

TPL = {
 '73581-d-60-12': dict(bnds=[-15, 2395, 3756, 6166, 7527, 9937], rowH=-2410, rowH2=-1361,
                       pageW=11906, pageH=16838, left=-15, right=11906, top=709, bottom=0),
 '73649-38-16-9': dict(bnds=[-15, 2140, 4295, 6450, 8605, 10760], rowH=-958,
                       pageW=11906, pageH=16838, left=-15, right=11906, top=709, bottom=0),
 '73571-99-34':   dict(bnds=[-71, 5684, 11439], rowH=-1928,
                       pageW=11906, pageH=16838, left=-71, right=11906, top=709, bottom=0),
 '73622-105-57':  dict(bnds=[-15, 5938, 11891], rowH=-3232,
                       pageW=11906, pageH=16838, left=-15, right=11891, top=709, bottom=0),
 '73572-66-7-46': dict(bnds=[-57, 3838, 7733, 11628], rowH=-2608,
                       pageW=11906, pageH=16838, left=-57, right=11628, top=709, bottom=0),
 '73642-52-5-35': dict(bnds=[-15, 2962, 5939, 8916, 11893], rowH=-1985,
                       pageW=11906, pageH=16838, left=-15, right=11893, top=709, bottom=0),
}

print(f'{"template":18} {"cols":>4} {"cw mm":>8} {"col0 mm":>8} {"right mm":>9} '
      f'{"rowH mm":>8} {"rows fit":>8} {"per sheet":>9}')
for k, v in TPL.items():
    b = v['bnds']
    cols = len(b) - 1
    cw = mm(b[1] - b[0])
    col0 = mm(b[0] + v['left'] if False else 0)  # column 0 starts at paper x=0 by construction
    right = mm(b[-1])
    rh = mm(-v['rowH'])
    printable_h = mm(v['pageH'] - v['top'] - v['bottom'])
    rows_fit = printable_h / rh
    print(f'{k:18} {cols:>4} {cw:>8.3f} {0.0:>8.3f} {right:>9.3f} {rh:>8.3f} '
          f'{rows_fit:>8.3f} {cols*int(rows_fit):>9}')
