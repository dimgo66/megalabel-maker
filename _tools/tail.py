import olefile, struct, glob, os

for path in sorted(glob.glob(r'C:\Users\User\.dsh\attachments\v1\files\**\*.doc', recursive=True)):
    name = os.path.basename(path)
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    fl = struct.unpack_from('<H', wd, 0x0A)[0]
    tn = '1Table' if (fl >> 9) & 1 else '0Table'
    tbl = ole.openstream(tn).read()
    ole.close()
    print('='*80)
    print(name, 'wd', len(wd), 'tbl', len(tbl))
    # search both streams for the page-setup sprm
    for sname, data in (('WD', wd), ('TBL', tbl)):
        idx = []
        i = -1
        while True:
            i = data.find(b'\x1f\xb0', i+1)
            if i < 0: break
            idx.append(i)
        print(f'  {sname}: 1fb0 at {idx}')
    # tail of WD
    print('  WD tail 100 bytes:')
    tail = wd[-100:]
    for i in range(0, len(tail), 20):
        base = len(wd)-100+i
        print(f'    @{base:5}: ' + ' '.join(f'{b:02x}' for b in tail[i:i+20]))
    # tail of TBL
    print('  TBL tail 60 bytes:')
    t2 = tbl[-60:]
    for i in range(0, len(t2), 20):
        base = len(tbl)-60+i
        print(f'    @{base:5}: ' + ' '.join(f'{b:02x}' for b in t2[i:i+20]))
