import olefile, struct, sys, re

FILES = [
    (r"C:\Users\User\.dsh\attachments\v1\files\4f\4f1e5711bf6b2c97fc86275726f9a68e21c88d1acc52229804b4b19e6301df6e\73581-d-60-12.doc", 60, 12),
    (r"C:\Users\User\.dsh\attachments\v1\files\59\593e3f89af29ee13bf75f3c81054d790046da070306d02bacdfcfaf11da8e659\73649-38-16-9.doc", 38, 16.9),
    (r"C:\Users\User\.dsh\attachments\v1\files\5b\5b85a0c95b1a87268c2b6d40fb4322134f52d074a06330c900947cc7af7e60de\73571-99-34.doc", 99, 34),
    (r"C:\Users\User\.dsh\attachments\v1\files\d5\d57ea8e2eb8846b50c989c295fbb93c738d5d539728659ce3e6d8c2179a964a8\73622-105-57.doc", 105, 57),
    (r"C:\Users\User\.dsh\attachments\v1\files\2e\2ec7f8d37660d634646fc2f08ecb7fadc51614c1d4bcb7b07f6518f4b0fb3e5c\73572-66-7-46.doc", 66.7, 46),
    (r"C:\Users\User\.dsh\attachments\v1\files\4b\4bbfadcf1167d000266956dd6d15eef15c6faae2c8e93dd83e43dc34cf8b6016\73642-52-5-35.doc", 52.5, 35),
]
TPMM = 56.69291338582677

for path, w_mm, h_mm in FILES:
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    tn = '1Table' if ole.exists('1Table') else '0Table'
    tab = ole.openstream(tn).read()
    name = path.split('\\')[-1]
    print('=' * 90)
    print(name, 'expected %.1f x %.1f mm = %.0f x %.0f tw' % (w_mm, h_mm, w_mm*TPMM, h_mm*TPMM))
    # find all D608
    hits = [m.start() for m in re.finditer(b'\x08\xd6', wd)]
    print(' D608 hits:', hits[:20])
    for h in hits[:3]:
        # try spra=6 interpretation: len byte at h+2
        L1 = wd[h+2]
        print('  hit at %d: next bytes %s  lenbyte=%d' % (h, wd[h:h+16].hex(), L1))
        # candidate operand region generous
        reg = wd[h+3:h+3+220]
        # search for increasing int16 runs at every byte offset
        best = None
        for off in range(0, 12):
            vals = []
            i = off
            while i + 1 < len(reg):
                vals.append(struct.unpack_from('<h', reg, i)[0])
                i += 2
            # find longest strictly increasing prefix run (allowing first few)
            run = 1
            for k in range(1, len(vals)):
                if vals[k] > vals[k-1] and vals[k] < 30000:
                    run += 1
                else:
                    break
            if best is None or run > best[1]:
                best = (off, run, vals[:run+2])
        print('     best monotonic run: offset=%d len=%d vals=%s' % best)
        # print ints at operand start for a few alignments
        for off in (0,1,2,3):
            vals=[struct.unpack_from('<h',reg,i)[0] for i in range(off,min(off+40,len(reg)-1),2)]
            print('       off %d: %s' % (off, vals[:20]))
    print()
