# -*- coding: utf-8 -*-
"""
WORD 97-2003 (.doc) PAGE SETUP + TABLE GRID GEOMETRY EXTRACTOR
=============================================================
Pure-python (olefile + struct).  No Word / LibreOffice / pandoc / antiword.

All distances are reported in twips and in millimetres.
    1440 twips = 1 inch = 25.4 mm   ->   1 mm = 56.69291338582677 twips

Structures implemented (validated against the 6 sample files):
  FIB        : wIdent/nFib at 0, csw at 0x20, fibRgLw97 (cslw u32),
               cbRgFcLcb + fibRgFcLcb97 pairs, ccpText = fibRgLw97[3] = u32@0x4C
  table stm  : "1Table" when FibBase.flags bit 9 set, else "0Table"
  PlcfSed    : fibRgFcLcb97 pair 6.  NOTE: located in the TABLE stream.
               Sed = fn(u16) + fcSepx(u32) + fnMpr(u16) + fcMpr(u32), stride 12
               (so n = (lcb - 4) / 16)
  SEPX       : at fcSepx in WordDocument: u16 cb, then cb bytes of sprms
  Clx        : fibRgFcLcb97 pair 33 (== fixed fcClx@0x01A2 for nFib 193).
               NOTE: located in the TABLE stream.
  PlcfBtePapx: fibRgFcLcb97 pair 13, in the TABLE stream
               = (n+1) u32 FCs, then n u32 PnFkpPapx page numbers (x512)
  PAPX FKP   : 512-byte page in WordDocument:
                crun = page[511]
                rgfc = (crun+1) u32 at 0
                rgbx = crun * BX(13 bytes: bOffset u8 + PHE 12 bytes) at 4*(crun+1)
                if bOffset != 0: cw = page[bOffset*2]; grpprl = page[bOffset*2+1 : +cw*2]
                                 istd = u16(grpprl,0); sprms from grpprl[2:]
                if bOffset == 0: cb = u16(page,0); grpprl = page[2:2+cb]; sprms from 0
  TDefTable  : sprm 0xD608 (spra=6).  Operand layout observed in Word 97 output:
                 op[0]  = 0x00
                 op[1]  = cItcMac  (number of columns)
                 op[2 : 2+2*(cItcMac+1)] = rgdxaCenter : cell boundaries,
                                           int16 LE, deltaX from left text margin
                 op[2+2*(cItcMac+1) : ]  = cItcMac * TC(20 bytes)
                                           TC = rgf(u16) + wWidth(u16) + 16 more bytes
               total operand length = 22*cItcMac + 4   (verified for every file)

Usage:  python doc_geometry.py [file.doc ...]
Output: console + D:\\...\\_tools\\doc_geometry_report.txt
"""

import os
import re
import sys
import struct
import traceback

try:
    import olefile
except ImportError:                                   # pragma: no cover
    sys.exit('olefile is required:  pip install olefile')

TWIPS_PER_MM = 1440.0 / 25.4                          # 56.69291338582677
OUT_PATH = r"D:\Yandex.Disk\www-yandex\megalabel-maker\_tools\doc_geometry_report.txt"

FILES = [
    (r"C:\Users\User\.dsh\attachments\v1\files\4f\4f1e5711bf6b2c97fc86275726f9a68e21c88d1acc52229804b4b19e6301df6e\73581-d-60-12.doc",      "d=60 round, 12/sheet"),
    (r"C:\Users\User\.dsh\attachments\v1\files\59\593e3f89af29ee13bf75f3c81054d790046da070306d02bacdfcfaf11da8e659\73649-38-16-9.doc",      "38 x 16.9"),
    (r"C:\Users\User\.dsh\attachments\v1\files\5b\5b85a0c95b1a87268c2b6d40fb4322134f52d074a06330c900947cc7af7e60de\73571-99-34.doc",        "99 x 34"),
    (r"C:\Users\User\.dsh\attachments\v1\files\d5\d57ea8e2eb8846b50c989c295fbb93c738d5d539728659ce3e6d8c2179a964a8\73622-105-57.doc",       "105 x 57"),
    (r"C:\Users\User\.dsh\attachments\v1\files\2e\2ec7f8d37660d634646fc2f08ecb7fadc51614c1d4bcb7b07f6518f4b0fb3e5c\73572-66-7-46.doc",      "66.7 x 46"),
    (r"C:\Users\User\.dsh\attachments\v1\files\4b\4bbfadcf1167d000266956dd6d15eef15c6faae2c8e93dd83e43dc34cf8b6016\73642-52-5-35.doc",      "52.5 x 35"),
]

# ------------------------------------------------------------------ helpers
def u8(b, o):
    return b[o]

def u16(b, o):
    return struct.unpack_from('<H', b, o)[0]

def i16(b, o):
    return struct.unpack_from('<h', b, o)[0]

def u32(b, o):
    return struct.unpack_from('<I', b, o)[0]

def i32(b, o):
    return struct.unpack_from('<i', b, o)[0]

def mm(tw):
    """twips -> millimetres, rounded to 0.01"""
    return round(tw / TWIPS_PER_MM, 2)

def fmt(tw):
    """'n tw (m.mm mm)'"""
    return '%d tw = %.2f mm' % (tw, mm(tw))

# ------------------------------------------------------------------ SPRM
# spra -> operand length ; -1 = variable (spra == 6)
SPRA_LEN = {0: 1, 1: 1, 2: 2, 3: 4, 4: 2, 5: 2, 6: -1, 7: 3}

SPRM_NAMES = {
    # --- section (sgc == 4) -------------------------------------------------
    0xB01F: 'sprmSXaPage        (page width)',
    0xB020: 'sprmSYaPage        (page height)',
    0xB021: 'sprmSDxaLeft       (left margin)',
    0xB022: 'sprmSDxaRight      (right margin)',
    0xB023: 'sprmSDyaTop        (top margin)',
    0xB024: 'sprmSDyaBottom     (bottom margin)',
    0xB017: 'sprmSDyaHdrTop     (header distance from top)',
    0xB018: 'sprmSDyaHdrBottom  (footer distance from bottom)',
    0xB01D: 'sprmSNCols         (number of text columns)',
    0xB01E: 'sprmSDxaColumns    (spacing between columns)',
    0xB01C: 'sprmSDxaGutter     (gutter width)',
    0xB01A: 'sprmSXaPage(old)/sprmSDyaTop',
    0xB01B: 'sprmSYaPage(old)',
    0x9021: 'sprmSDxaLeft (old 8x)',
    0x9022: 'sprmSDxaRight (old 8x)',
    0x9023: 'sprmSDyaTop (old 8x)',
    0x9024: 'sprmSDyaBottom (old 8x)',
    0x903B: 'sprmSDyaHdrTop (old 8x)',
    0x903C: 'sprmSDyaHdrBottom (old 8x)',
    0x301D: 'sprmS* 0x301D',
    0x900C: 'sprmS* 0x900C',
    0x9025: 'sprmS* 0x9025',
    0xB025: 'sprmS* 0xB025',
    # --- table (sgc == 5) ---------------------------------------------------
    0xD608: 'sprmTDefTable      (table grid definition)',
    0xD609: 'sprmTDefTableShd   (table cell shading)',
    0xD606: 'sprmTDxaCol / TDefTable(old)',
    0xD605: 'sprmTTableBorders (old)',
    0xD612: 'sprmTTableBorders',
    0xD613: 'sprmTDefTableShd(old)',
    0xD61A: 'sprmTDxaGapHalf / border-related',
    0xD61B: 'sprmTDxaGapHalf / border-related',
    0xD61C: 'sprmTDxaGapHalf / border-related',
    0xD61D: 'sprmTDxaGapHalf / border-related',
    0xD620: 'sprmTTableWidth',
    0xD634: 'sprmTInsert        (insert cells)',
    0xD670: 'sprmTDefTableShd3 / 0xD670',
    0x9407: 'sprmTDyaRowHeight  (row height; <0 == exact, >=0 == at-least)',
    # --- paragraph ----------------------------------------------------------
    0x2416: 'sprmPFInTable',
    0x2417: 'sprmPFTtp          (this paragraph ends a table row)',
    0x6649: 'sprmPFInnerTableCell',
    0x244B: 'sprmPJc',
    0xF614: 'sprmP* 0xF614',
    0xF617: 'sprmP* 0xF617',
    0xF661: 'sprmP* 0xF661',
    0x2461: 'sprmPFSideBySide',
    0x245B: 'sprmPDxaRight',
    0x845D: 'sprmPItap',
    0x6640: 'sprmPFInnerTableCell/old',
}

def sprm_name(code):
    return SPRM_NAMES.get(code, '')

def sprm_group(code):
    """sgc = (sprm >> 10) & 7"""
    return (code >> 10) & 7

def parse_sprms(data, start, end):
    """Parse a sprms (grpprl) byte range.
    Returns (list_of_(code, spra, operand_bytes), consumed_end, clean_bool)."""
    out = []
    i = start
    while i < end:
        if i + 2 > end:
            return out, i, False
        code = u16(data, i)
        spra = (code >> 13) & 7
        if spra == 6:
            if i + 3 > end:
                return out, i, False
            ln = data[i + 2]
            if ln == 0xFF:
                if i + 5 > end:
                    return out, i, False
                ln = u16(data, i + 3)
                op = data[i + 5:i + 5 + ln]
                i += 5 + ln
            else:
                op = data[i + 3:i + 3 + ln]
                i += 3 + ln
        else:
            ln = SPRA_LEN.get(spra)
            if ln is None or i + 2 + ln > end:
                return out, i, False
            op = data[i + 2:i + 2 + ln]
            i += 2 + ln
        out.append((code, spra, op))
    return out, i, (i == end)

# ------------------------------------------------------------------ FIB
class Fib(object):
    pass

def parse_fib(wd):
    f = Fib()
    f.wIdent = u16(wd, 0x00)
    f.nFib = u16(wd, 0x02)
    f.flags = u16(wd, 0x0A)
    f.fWhichTblStm = (f.flags >> 9) & 1
    f.fcMin = i32(wd, 0x18)
    f.fcMac = i32(wd, 0x1C)
    f.csw = u16(wd, 0x20)
    o = 0x22 + f.csw * 2                     # fibRgW97
    f.cslw = u16(wd, o)
    f.fibRgLw_off = o + 2
    o2 = f.fibRgLw_off + f.cslw * 4
    f.cbRgFcLcb = u16(wd, o2)
    f.rgFcLcb_off = o2 + 2
    f.ccpText = u32(wd, f.fibRgLw_off + 12)  # == u32 @ 0x4C for nFib 193
    return f

def fc_lcb(wd, f, idx):
    off = f.rgFcLcb_off + idx * 8
    return u32(wd, off), u32(wd, off + 4)

# ------------------------------------------------------------------ Clx / text
def parse_clx(wd, table, f):
    fcClx, lcbClx = fc_lcb(wd, f, 33)
    if fcClx == 0 or lcbClx == 0:                      # fall back to fixed offsets
        fcClx, lcbClx = u32(wd, 0x01A2), u32(wd, 0x01A6)
    clx = table[fcClx:fcClx + lcbClx]
    i, pcdt, nprc = 0, None, 0
    while i < len(clx):
        t = clx[i]
        if t == 1:
            cb = u16(clx, i + 1)
            nprc += 1
            i += 3 + cb
        elif t == 2:
            lcb = u32(clx, i + 1)
            pcdt = clx[i + 5:i + 5 + lcb]
            i += 5 + lcb
        else:
            break
    pieces, text = [], ''
    if pcdt and len(pcdt) >= 4:
        n = (len(pcdt) - 4) // 12
        cps = [u32(pcdt, k * 4) for k in range(n + 1)]
        for k in range(n):
            off = (n + 1) * 4 + k * 8
            fc = u32(pcdt, off + 2)
            comp = bool(fc & 0x40000000)
            fcv = fc & 0x3FFFFFFF
            cch = cps[k + 1] - cps[k]
            if comp:
                s = wd[fcv // 2:fcv // 2 + cch].decode('cp1251', 'replace')
            else:
                s = wd[fcv:fcv + cch * 2].decode('utf-16-le', 'replace')
            pieces.append(dict(i=k, cpStart=cps[k], cpEnd=cps[k + 1], fc=fcv,
                               compressed=comp, cch=cch))
            text += s
    return dict(fcClx=fcClx, lcbClx=lcbClx, nPrc=nprc, pieces=pieces, text=text)

# ------------------------------------------------------------------ PlcfSed / SEPX
def parse_sections(wd, table, f):
    """Returns (list_of_sections, diagnostic_info)."""
    fc, lcb = fc_lcb(wd, f, 6)
    info = dict(fc=fc, lcb=lcb, n=0, note='')
    if lcb == 0 or fc + lcb > len(table):
        info['note'] = ('PlcfSed not usable (fc=%d lcb=%d tablelen=%d)' % (fc, lcb, len(table)))
        return [], info
    plc = table[fc:fc + lcb]
    n = (lcb - 4) // 16                                # (n+1)*4 + n*12
    info['n'] = n
    cps = [u32(plc, k * 4) for k in range(n + 1)]
    seds = []
    for k in range(n):
        off = (n + 1) * 4 + k * 12
        fn = u16(plc, off)
        fcSepx = u32(plc, off + 2)
        fnMpr = u16(plc, off + 6)
        fcMpr = u32(plc, off + 8)
        sprms, raw, cb, clean = [], b'', None, None
        if fcSepx != 0xFFFFFFFF and fcSepx + 2 <= len(wd):
            cb = u16(wd, fcSepx)
            raw = wd[fcSepx + 2:fcSepx + 2 + cb]
            sprms, consumed, clean = parse_sprms(raw, 0, len(raw))
        seds.append(dict(i=k, cpStart=cps[k], cpEnd=cps[k + 1], fn=fn,
                         fcSepx=fcSepx, fnMpr=fnMpr, fcMpr=fcMpr, cb=cb,
                         raw=raw, sprms=sprms, clean=clean))
    return seds, info

# Word 97 defaults (letter, 1.25" left/right, 1" top/bottom, 0.5" header)
SEC_DEFAULTS = dict(xaPage=12240, yaPage=15840, dxaLeft=1800, dxaRight=1800,
                    dyaTop=1440, dyaBottom=1440, dyaHdrTop=720, dyaHdrBottom=720)

SEC_MAP = {
    0xB01F: 'xaPage', 0xB020: 'yaPage',
    0xB021: 'dxaLeft', 0xB022: 'dxaRight',
    0xB023: 'dyaTop', 0xB024: 'dyaBottom',
    0xB017: 'dyaHdrTop', 0xB018: 'dyaHdrBottom',
    0x9021: 'dxaLeft', 0x9022: 'dxaRight',
    0x9023: 'dyaTop', 0x9024: 'dyaBottom',
    0x903B: 'dyaHdrTop', 0x903C: 'dyaHdrBottom',
}
SEC_KEYS = ('xaPage', 'yaPage', 'dxaLeft', 'dxaRight', 'dyaTop', 'dyaBottom',
            'dyaHdrTop', 'dyaHdrBottom')

def section_geometry(sprms):
    """Decode page geometry from a list of (code, spra, operand)."""
    g = dict(SEC_DEFAULTS)
    raw_vals = {}
    for code, spra, op in sprms:
        if code in SEC_MAP and len(op) >= 2:
            g[SEC_MAP[code]] = i16(op, 0)
            raw_vals[code] = i16(op, 0)
        elif code in (0xB01D, 0xB01E, 0xB01C) and len(op) >= 2:
            raw_vals[code] = i16(op, 0)
        elif code in (0xB01D, 0xB01E) and len(op) == 1:
            raw_vals[code] = op[0]
    return g, raw_vals

# ------------------------------------------------------------------ PlcfBtePapx / PAPX
def parse_papx(wd, table, f):
    """Returns (list_of_paragraphs, info)."""
    fc, lcb = fc_lcb(wd, f, 13)
    info = dict(fc=fc, lcb=lcb, n=0, pns=[], note='')
    paras = []
    if lcb == 0 or fc + lcb > len(table):
        info['note'] = 'PlcfBtePapx missing/out of range (fc=%d lcb=%d)' % (fc, lcb)
        return paras, info
    plc = table[fc:fc + lcb]
    n = (lcb - 4) // 8
    info['n'] = n
    fcs = [u32(plc, k * 4) for k in range(n + 1)]
    pns = [u32(plc, (n + 1) * 4 + k * 4) for k in range(n)]
    info['pns'] = pns
    for pn in pns:
        if pn == 0:
            paras.append(dict(pn=0, fc=None, note='PnFkpPapx==0: in-plcfbte PAPX (not present in these files)'))
            continue
        base = pn * 512
        page = wd[base:base + 512]
        if len(page) < 512:
            paras.append(dict(pn=pn, fc=None, note='FKP page beyond WordDocument'))
            continue
        crun = page[511]
        rgfc = [u32(page, k * 4) for k in range(crun + 1)]
        for j in range(crun):
            bxoff = 4 * (crun + 1) + j * 13
            bOffset = page[bxoff]
            phe = page[bxoff + 1:bxoff + 13]
            po = bOffset * 2
            note = ''
            if bOffset == 0:
                cb = u16(page, 0)
                grpprl = page[2:2 + cb]
                istd = None
                sprms, consumed, clean = parse_sprms(grpprl, 0, len(grpprl))
            else:
                if po + 1 > 512:
                    paras.append(dict(pn=pn, fc=rgfc[j], note='bOffset out of page'))
                    continue
                cw = page[po]
                grpprl = page[po + 1:po + 1 + cw * 2]
                istd = u16(grpprl, 0) if len(grpprl) >= 2 else None
                sprms, consumed, clean = parse_sprms(grpprl, 2, len(grpprl))
                if not clean:
                    note = 'sprm parse did not consume grpprl exactly (%d of %d)' % (consumed, len(grpprl))
            paras.append(dict(pn=pn, fc=rgfc[j], fcEnd=rgfc[j + 1], bOffset=bOffset,
                              istd=istd, cw=(page[po] if bOffset else None),
                              grpprl=grpprl, sprms=sprms, note=note, base=base, j=j))
    return paras, info

# ------------------------------------------------------------------ TDefTable
TC_FLAG_BITS = [(0x0001, 'fFirstMerged'), (0x0002, 'fMerged'), (0x0004, 'fVertical'),
                (0x0008, 'fBackward'), (0x0010, 'fRotateFont'),
                (0x0020, 'fVertMerge'), (0x0040, 'fVertRestart')]

def decode_tdef(op):
    """Decode a sprmTDefTable (0xD608) operand.
    Empirically (Word 97 output):
        op[0]  = 0x00
        op[1]  = cItcMac
        op[2:] = (cItcMac+1) int16 boundaries, then cItcMac * 20-byte TC
    Returns dict or None."""
    if len(op) < 4:
        return None
    itc = op[1]
    if itc == 0:
        return None
    need = 2 + 2 * (itc + 1) + 20 * itc
    if len(op) < need:
        return None
    bnd = [i16(op, 2 + 2 * k) for k in range(itc + 1)]
    tbase = 2 + 2 * (itc + 1)
    tcs = []
    for k in range(itc):
        q = tbase + 20 * k
        rgf = u16(op, q)
        w = u16(op, q + 2)
        names = [n for b, n in TC_FLAG_BITS if rgf & b]
        tcs.append(dict(rgf=rgf, flags=names, width=w))
    return dict(itcMac=itc, boundaries=bnd, tcs=tcs,
                cellWidths=[bnd[k + 1] - bnd[k] for k in range(itc)],
                op0=op[0], oplen=len(op), need=need, fits=(len(op) == need))

# ------------------------------------------------------------------ analysis
def analyse(path):
    ole = olefile.OleFileIO(path)
    streams = ['/'.join(e) for e in ole.listdir()]
    wd = ole.openstream('WordDocument').read()
    f = parse_fib(wd)
    tname = '1Table' if f.fWhichTblStm else '0Table'
    if not ole.exists(tname):
        tname = '1Table' if ole.exists('1Table') else '0Table'
    table = ole.openstream(tname).read()
    r = dict(path=path, name=os.path.basename(path), streams=streams,
             fib=f, tname=tname, wd=wd, wd_len=len(wd), table_len=len(table))
    r['clx'] = parse_clx(wd, table, f)
    r['seds'], r['sed_info'] = parse_sections(wd, table, f)
    r['paras'], r['papx_info'] = parse_papx(wd, table, f)
    ole.close()
    return r

def collect(r):
    """Derive the geometry facts from a parsed document."""
    f = r['fib']
    text = r['clx']['text']
    marks = text.count('\x07')
    crs = text.count('\r')

    # -- sections ---------------------------------------------------------
    if r['seds']:
        seds = r['seds']
        g, secraw = section_geometry(seds[-1]['sprms'])
    else:
        seds = []
        g, secraw = dict(SEC_DEFAULTS), {}

    # -- table definitions: one per row (Word repeats TDefTable in each row PAPX)
    tdefs = []            # (fc, tdef_dict, rowheight, sprm_list)
    alltablesprms = {}
    paras_with_tdef = []
    for p in r['paras']:
        if not p.get('sprms'):
            continue
        rh = None
        td = None
        codes = []
        for code, spra, op in p['sprms']:
            codes.append(code)
            if sprm_group(code) == 5:
                alltablesprms.setdefault(code, []).append(op.hex())
            if code == 0xD608:
                cand = decode_tdef(op)
                if cand and (td is None or cand['itcMac'] > td['itcMac']):
                    td = cand
                    td['raw'] = op
                    td['fc'] = p.get('fc')
            if code == 0x9407 and len(op) >= 2:
                rh = i16(op, 0)
        if td is not None:
            tdefs.append(dict(td=td, rowheight=rh, fc=p.get('fc'),
                              istd=p.get('istd'), codes=codes))
            paras_with_tdef.append(p)

    # choose the dominant (most frequent) table definition
    td_main = None
    if tdefs:
        from collections import Counter
        key = Counter()
        for t in tdefs:
            k = (t['td']['itcMac'], tuple(t['td']['boundaries']),
                 tuple(x['width'] for x in t['td']['tcs']))
            key[k] += 1
        best = key.most_common(1)[0][0]
        for t in tdefs:
            k = (t['td']['itcMac'], tuple(t['td']['boundaries']),
                 tuple(x['width'] for x in t['td']['tcs']))
            if k == best:
                td_main = t['td']
                break

    ncols = td_main['itcMac'] if td_main else None
    nrows = None
    if ncols:
        nrows = marks // (ncols + 1)

    rowheights = [t['rowheight'] for t in tdefs if t['rowheight'] is not None]
    rowheights_exact = [abs(v) for v in rowheights if v is not None]

    return dict(g=g, secraw=secraw, seds=seds, text=text, marks=marks, crs=crs,
                tdefs=tdefs, td_main=td_main, ncols=ncols, nrows=nrows,
                rowheights=rowheights, rowheights_exact=rowheights_exact,
                alltablesprms=alltablesprms, paras_with_tdef=paras_with_tdef)

# ------------------------------------------------------------------ reporting
def expected_from_name(name):
    """Best-effort label dimensions guessed from the file name."""
    base = name[:-4] if name.lower().endswith('.doc') else name
    parts = base.split('-')
    if len(parts) >= 2 and parts[1] == 'd':             # 73581-d-60-12
        try:
            dia = float(parts[2])
            per = parts[3] if len(parts) > 3 else '?'
            return dict(kind='round', dia=dia, per_sheet=per,
                        text='round diameter %g mm, %s per sheet' % (dia, per))
        except Exception:
            return None
    tail = [p for p in parts[1:] if re.match(r'^\d+$', p)]
    try:
        if len(tail) == 4:                              # 73572-66-7-46 -> 66.7 x 46
            w = float(tail[0] + '.' + tail[1]); h = float(tail[2] + '.' + tail[3])
        elif len(tail) == 3:                            # 73642-52-5-35 -> 52.5 x 35
            w = float(tail[0] + '.' + tail[1]); h = float(tail[2])
        elif len(tail) == 2:                            # ambiguity: take as-is
            w = float(tail[0]); h = float(tail[1])
        else:
            return None
        return dict(kind='rect', w=w, h=h, text='%g x %g mm' % (w, h))
    except Exception:
        return None

def compare_with_name(name, cell_w_mm, cell_h_mm):
    """Return a list of comparison strings."""
    out = []
    base = name[:-4]
    parts = base.split('-')
    # ---- 73581-d-60-12 style: round diameter
    if len(parts) >= 2 and parts[1] == 'd':
        try:
            dia = float(parts[2])
            per = parts[3]
            out.append('  file name suggests: round label, diameter %g mm, %s per sheet' % (dia, per))
            out.append('  extracted cell width %.2f mm / height %.2f mm  vs  diameter %g mm'
                       % (cell_w_mm, cell_h_mm, dia))
        except Exception:
            pass
        return out
    # ---- numeric tail
    tail = [p for p in parts[1:] if re.match(r'^\d+$', p)]
    found_w = found_h = None
    txt = None
    if len(tail) == 4:                                  # 66-7-46 -> 66.7 x 46
        found_w = float(tail[0] + '.' + tail[1]); found_h = float(tail[2] + '.' + tail[3])
        txt = '%g x %g mm' % (found_w, found_h)
    elif len(tail) == 3:
        # 52-5-35 -> 52.5 x 35 ;  99-34 -> 99 x 34 handled by len==2
        found_w = float(tail[0] + '.' + tail[1]); found_h = float(tail[2])
        txt = '%g x %g mm' % (found_w, found_h)
    elif len(tail) == 2:
        found_w = float(tail[0]); found_h = float(tail[1])
        txt = '%g x %g mm' % (found_w, found_h)
    if found_w is not None:
        out.append('  file name suggests: %s (width x height)' % txt)
        out.append('  extracted cell width = %.2f mm -> difference %+.2f mm' % (cell_w_mm, cell_w_mm - found_w))
        if cell_h_mm is not None:
            out.append('  extracted cell height= %.2f mm -> difference %+.2f mm' % (cell_h_mm, cell_h_mm - found_h))
    return out

def report_file(r):
    L = []
    A = L.append
    f = r['fib']
    c = collect(r)
    g = c['g']
    A('=' * 108)
    A('FILE: %s' % r['name'])
    A('  path            : %s' % r['path'])
    A('  OLE streams     : %s' % ', '.join(r['streams']))
    A('  WordDocument    : %d bytes   Table stream: %s (%d bytes)'
      % (r['wd_len'], r['tname'], r['table_len']))
    A('  FIB             : wIdent=0x%04X nFib=%d flags=0x%04X fWhichTblStm=%d'
      % (f.wIdent, f.nFib, f.flags, f.fWhichTblStm))
    A('                    csw=%d cslw=%d cbRgFcLcb=%d ccpText=%d fcMin=%d fcMac=%d'
      % (f.csw, f.cslw, f.cbRgFcLcb, f.ccpText, f.fcMin, f.fcMac))
    wd = r['wd']
    A('  fibRgFcLcb97 at 0x%X (cbRgFcLcb=%d -> %d pairs), ccpText=%d'
      % (f.rgFcLcb_off, f.cbRgFcLcb, f.cbRgFcLcb // 8, f.ccpText))
    for idx, nm in ((6, 'fcPlcfsed'), (12, 'fcPlcfbteChpx'),
                    (13, 'fcPlcfbtePapx'), (33, 'fcClx')):
        off = f.rgFcLcb_off + idx * 8
        A('  fibRgFcLcb97[%2d] %-14s fc=%-6d lcb=%-6d   (raw offset base+0x%X)'
          % (idx, nm, u32(wd, off), u32(wd, off + 4), idx * 8))
    A('  fixed fcClx@0x01A2=%d lcbClx@0x01A6=%d (cross-check)'
      % (u32(wd, 0x01A2), u32(wd, 0x01A6)))

    # --- section / page setup -------------------------------------------
    A('')
    A('  --- SECTION PROPERTIES (SEPX / PlcfSed) ---')
    A('  PlcfSed (pair 6, table stream): fc=%d lcb=%d sections=%d %s'
      % (r['sed_info']['fc'], r['sed_info']['lcb'], r['sed_info']['n'],
         r['sed_info'].get('note', '')))
    if not c['seds']:
        A('  -> no PlcfSed/SEPX found; Word 97 default page setup assumed')
    for sd in c['seds']:
        A('  section %d: text cp %d..%d  fn=%d fcSepx=%s cb=%s  fnMpr=%d fcMpr=0x%08X'
          % (sd['i'], sd['cpStart'], sd['cpEnd'], sd['fn'],
             'none' if sd['fcSepx'] == 0xFFFFFFFF else sd['fcSepx'], sd['cb'],
             sd['fnMpr'], sd['fcMpr']))
        A('    SEPX raw bytes (%s): %s' % (len(sd['raw']), sd['raw'].hex()))
        if sd['sprms']:
            A('    decoded sprms (%d) [sprm parse consumed %s] :'
              % (len(sd['sprms']), 'all bytes' if sd['clean'] else 'partially'))
            for code, spra, op in sd['sprms']:
                v = i16(op, 0) if len(op) >= 2 else (op[0] if op else None)
                extra = ''
                if code in SEC_MAP:
                    extra = '   -> %.2f mm' % mm(v)
                A('      0x%04X spra=%d len=%-3d op=%-12s val=%-8s %s%s'
                  % (code, spra, len(op), op.hex(), v, sprm_name(code), extra))
        else:
            A('    (no sprms in this SEPX)')
    A('')
    A('  DECODED PAGE SETUP (used values):')
    A('    page size      : W=%s' % fmt(g['xaPage']))
    A('                     H=%s' % fmt(g['yaPage']))
    A('    margins        : L=%s' % fmt(g['dxaLeft']))
    A('                     R=%s' % fmt(g['dxaRight']))
    A('                     T=%s' % fmt(g['dyaTop']))
    A('                     B=%s' % fmt(g['dyaBottom']))
    A('    header/footer  : HdrTop=%s  HdrBottom=%s'
      % (fmt(g['dyaHdrTop']), fmt(g['dyaHdrBottom'])))
    paW = g['xaPage'] - g['dxaLeft'] - g['dxaRight']
    paH = g['yaPage'] - g['dyaTop'] - g['dyaBottom']
    A('    printable area : W=%s' % fmt(paW))
    A('                     H=%s' % fmt(paH))
    if 0xB01D in c['secraw']:
        A('    sprmSNCols (nCols) = %s' % c['secraw'][0xB01D])
    if 0xB01E in c['secraw']:
        A('    sprmSDxaColumns    = %d tw = %.2f mm' % (c['secraw'][0xB01E], mm(c['secraw'][0xB01E])))

    # --- text -----------------------------------------------------------
    cl = r['clx']
    A('')
    A('  --- TEXT / PIECE TABLE (Clx) ---')
    A('  Clx: fcClx=%d lcbClx=%d  pieces=%d  Prc count=%d'
      % (cl['fcClx'], cl['lcbClx'], len(cl['pieces']), cl['nPrc']))
    for p in cl['pieces']:
        A('    piece %d: cp %d..%d  fc=0x%06X  %s  cch=%d'
          % (p['i'], p['cpStart'], p['cpEnd'], p['fc'],
             'compressed (8-bit cp1251)' if p['compressed'] else 'UTF-16LE', p['cch']))
    A('  main text length (ccpText)      : %d' % f.ccpText)
    A('  extracted char count            : %d' % len(c['text']))
    A('  \\x07 (cell / row-end mark) count : %d' % c['marks'])
    A('  \\x0d (paragraph mark) count      : %d' % c['crs'])
    A('  text repr                       : %r' % c['text'][:160])
    A('  non-mark characters             : %d'
      % len([ch for ch in c['text'] if ch not in ('\x07', '\r', '\x0b', '\x0c', '\x1e', '\x1f', '\x13', '\x14', '\x15', '\x01', '\x02', '\x08')]))

    # --- PAPX -----------------------------------------------------------
    A('')
    A('  --- PAPX (PlcfBtePapx) ---')
    pi = r['papx_info']
    A('  PlcfBtePapx (pair 13, table stream): fc=%d lcb=%d n=%d' % (pi['fc'], pi['lcb'], pi['n']))
    A('  PnFkpPapx page numbers: %s' % pi['pns'])
    A('  paragraphs found: %d' % len(r['paras']))
    for p in r['paras']:
        if p.get('fc') is None:
            A('    [pn=%s] %s' % (p.get('pn'), p.get('note')))
    d608 = [t for t in c['tdefs']]
    A('  paragraphs whose PAPX carries a sprmTDefTable (0xD608): %d'
      % len(d608))
    for t in d608:
        A('    fc=0x%X istd=%s rowheight(0x9407)=%s sprmcodes=%s'
          % (t['fc'], t['istd'],
             ('%d tw (%.2f mm)%s' % (t['rowheight'], mm(abs(t['rowheight'])),
                                     ' exact' if t['rowheight'] < 0 else ' at-least'))
             if t['rowheight'] is not None else 'none',
             ' '.join('%04X' % x for x in t['codes'])))

    # --- TDefTable ------------------------------------------------------
    A('')
    A('  --- TABLE GRID (sprmTDefTable 0xD608) ---')
    if not c['td_main']:
        A('  !! NO usable sprmTDefTable found.')
        A('     The table grid cannot be derived from PAPX for this file.')
    else:
        td = c['td_main']
        A('  operand length = %d bytes ; expected 22*cItcMac+4 = %d ; length matches: %s'
          % (td['oplen'], td['need'], td['fits']))
        A('  operand[0] = 0x%02X (reserved/zero byte)   operand[1] = cItcMac = %d'
          % (td['op0'], td['itcMac']))
        A('  raw operand: %s' % td['raw'].hex())
        A('  cell boundaries rgdxaCenter (deltaX from left text margin):')
        for k, b in enumerate(td['boundaries']):
            A('    b[%d] = %s' % (k, fmt(b)))
        A('  cell boundaries (mm from LEFT EDGE OF PAPER = left margin %.2f mm):'
          % mm(g['dxaLeft']))
        for k, b in enumerate(td['boundaries']):
            A('    b[%d] = %.2f mm' % (k, mm(g['dxaLeft'] + b)))
        A('  cell widths from rgdxaCenter:')
        for k, w in enumerate(td['cellWidths']):
            A('    col[%d] = %s' % (k, fmt(w)))
        A('  TC structures (20 bytes each: rgf u16 + wWidth u16 + 16 bytes):')
        for k, tc in enumerate(td['tcs']):
            A('    TC[%d] rgf=0x%04X %-30s wWidth=%s'
              % (k, tc['rgf'], ('[' + ','.join(tc['flags']) + ']') if tc['flags'] else '[]',
                 fmt(tc['width'])))

    # --- all table-group sprms -----------------------------------------
    A('')
    A('  --- every table-group sprm (sgc==5, i.e. 0x?6xx/0xD6xx style) found in PAPX ---')
    if not c['alltablesprms']:
        A('    (none)')
    for code in sorted(c['alltablesprms']):
        ops = c['alltablesprms'][code]
        A('    0x%04X  x%-3d %s' % (code, len(ops), sprm_name(code)))
        for h in ops[:4]:
            A('           op=%s' % h)
        if len(ops) > 4:
            A('           ... (%d more identical/other operands)' % (len(ops) - 4))

    # --- row heights ----------------------------------------------------
    A('')
    A('  --- row heights (sprmTDyaRowHeight 0x9407) ---')
    if c['rowheights']:
        A('    raw values (i16, negative == exact height): %s' % c['rowheights'])
        A('    absolute heights (twips): %s' % c['rowheights_exact'])
        A('    absolute heights (mm)   : %s' % [mm(v) for v in c['rowheights_exact']])
        uniq = sorted(set(c['rowheights_exact']))
        A('    distinct heights: %s' % ', '.join(fmt(v) for v in uniq))
    else:
        A('    (not present -> rows use automatic height)')

    # --- summary --------------------------------------------------------
    A('')
    A('  --- SUMMARY ---')
    A('    page                 : %.2f x %.2f mm' % (mm(g['xaPage']), mm(g['yaPage'])))
    A('    margins L/R/T/B      : %.2f / %.2f / %.2f / %.2f mm'
      % (mm(g['dxaLeft']), mm(g['dxaRight']), mm(g['dyaTop']), mm(g['dyaBottom'])))
    A('    printable area       : %.2f x %.2f mm' % (mm(paW), mm(paH)))
    if c['td_main']:
        td = c['td_main']
        n = td['itcMac']
        span = td['boundaries'][-1] - td['boundaries'][0]
        pitch_x = span / n
        A('    columns              : %d' % n)
        A('    table grid span       : %s  (sum of cell widths)' % fmt(span))
        A('    pitch_x (exact)       : %s  (span / columns)' % fmt(pitch_x))
        A('    cell widths          : %s'
          % ', '.join('%.2f mm' % mm(w) for w in td['cellWidths']))
        A('    columns per page      : printable W %.2f mm / pitch_x %.2f mm = %.2f'
          % (mm(paW), mm(pitch_x), paW / pitch_x))
    if c['nrows'] is not None:
        A('    rows                 : %d  (from \\x07 marks: %d / (cols+1) = %d)'
          % (c['nrows'], c['marks'], c['nrows']))
        A('    TDefTable copies found: %d (= number of rows)' % len(c['tdefs']))
    if c['rowheights_exact']:
        vals = sorted(set(c['rowheights_exact']))
        A('    pitch_y (exact)       : %s%s'
          % (' = '.join(fmt(v) for v in vals),
             '  <-- ROWS HAVE ALTERNATING HEIGHTS' if len(vals) > 1 else ''))
        A('    rows per page         : printable H %.2f mm / pitch_y = %.2f'
          % (mm(paH), paH / vals[0]))
    if c['ncols'] and c['nrows']:
        A('    total labels per sheet: %d x %d = %d'
          % (c['ncols'], c['nrows'], c['ncols'] * c['nrows']))
    A('')
    A('  --- COMPARISON WITH FILE NAME ---')
    cw = mm(c['td_main']['cellWidths'][0]) if c['td_main'] else None
    ch = None
    if c['rowheights_exact']:
        ch = mm(c['rowheights_exact'][0])
    for line in compare_with_name(r['name'], cw if cw is not None else float('nan'),
                                  ch):
        A(line)
    return '\n'.join(L)

def quick_summary(r):
    c = collect(r)
    g = c['g']
    L = []
    A = L.append
    A('-' * 108)
    A('LABEL: %s' % r['name'])
    A('  page size        : %.2f x %.2f mm   (%d x %d tw)'
      % (mm(g['xaPage']), mm(g['yaPage']), g['xaPage'], g['yaPage']))
    A('  margins L/R/T/B  : %.2f / %.2f / %.2f / %.2f mm   (%d / %d / %d / %d tw)'
      % (mm(g['dxaLeft']), mm(g['dxaRight']), mm(g['dyaTop']), mm(g['dyaBottom']),
         g['dxaLeft'], g['dxaRight'], g['dyaTop'], g['dyaBottom']))
    paW = g['xaPage'] - g['dxaLeft'] - g['dxaRight']
    paH = g['yaPage'] - g['dyaTop'] - g['dyaBottom']
    A('  printable area   : %.2f x %.2f mm   (%d x %d tw)' % (mm(paW), mm(paH), paW, paH))
    A('  \\x07 marks       : %d      \\x0d marks: %d      ccpText: %d'
      % (c['marks'], c['crs'], r['fib'].ccpText))
    if c['td_main']:
        td = c['td_main']
        n = td['itcMac']
        span = td['boundaries'][-1] - td['boundaries'][0]
        A('  columns          : %d' % n)
        A('  boundaries (from left edge of paper, mm): %s'
          % ', '.join('%.2f' % mm(g['dxaLeft'] + b) for b in td['boundaries']))
        A('  cell widths (mm) : %s'
          % ', '.join('%.2f' % mm(w) for w in td['cellWidths']))
        A('  pitch_x          : %.2f mm  (%d tw)' % (mm(span / n), span / n))
        A('  columns per page : %.2f' % (paW / (span / n)))
    else:
        A('  columns          : UNKNOWN (no sprmTDefTable in PAPX)')
    if c['nrows'] is not None:
        A('  rows             : %d' % c['nrows'])
    if c['rowheights_exact']:
        vals = sorted(set(c['rowheights_exact']))
        A('  pitch_y (row h)  : %s mm  (%s tw)'
          % (' / '.join('%.2f' % mm(v) for v in vals), ' / '.join(str(v) for v in vals)))
        A('  rows per page    : %.2f' % (paH / vals[0]))
    else:
        A('  pitch_y (row h)  : auto (not specified)')
    if c['ncols'] and c['nrows']:
        A('  labels per sheet : %d (%d cols x %d rows)' % (c['ncols'] * c['nrows'], c['ncols'], c['nrows']))
    return '\n'.join(L)

def main():
    args = sys.argv[1:]
    files = [(p, '') for p in args] if args else FILES
    full, sums, errs = [], [], []
    for path, hint in files:
        if not os.path.exists(path):
            errs.append('MISSING FILE: %s' % path)
            continue
        try:
            r = analyse(path)
            sums.append(quick_summary(r))
            full.append(report_file(r))
        except Exception as e:
            errs.append('ERROR on %s: %s\n%s' % (path, e, traceback.format_exc()))

    head = [
        '=' * 108,
        'WORD 97-2003 (.doc)  PAGE SETUP + TABLE GRID GEOMETRY REPORT',
        '=' * 108,
        'Units : 1 inch = 1440 twips = 25.4 mm   ->   1 mm = %.6f twips' % TWIPS_PER_MM,
        'All millimetre values are rounded to 0.01 mm.',
        'Method : direct OLE/WordDocument + table stream parsing (FIB, PlcfSed/SEPX,',
        '         Clx, PlcfBtePapx/PAPX FKP, sprmTDefTable). No Word/LibreOffice used.',
        '',
        '=' * 108,
        'PART 1 - QUICK SUMMARY (one block per file)',
        '=' * 108,
        '',
    ]
    body = ['=' * 108,
            'PART 2 - FULL DETAIL (raw structures, every sprm, validation)',
            '=' * 108, '']
    text = ('\n'.join(head) + '\n'.join(sums) + '\n\n'
            + ('\n\n'.join(errs) + '\n\n' if errs else '')
            + '\n'.join(body) + '\n\n'.join(full) + '\n')
    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print(text)
    print('\nWROTE: %s' % OUT_PATH)

if __name__ == '__main__':
    main()
