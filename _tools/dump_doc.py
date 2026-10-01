import olefile, sys, struct

def find_text(data):
    # WordDocument: search for UTF-16LE runs of cyrillic/latin
    runs = []
    i = 0
    n = len(data)
    cur = []
    while i + 1 < n:
        ch = data[i] | (data[i+1] << 8)
        if 32 <= ch < 0x3000 and ch not in (0x0d,):
            cur.append(chr(ch))
        else:
            if len(cur) >= 4:
                runs.append(''.join(cur))
            cur = []
        i += 2
    if len(cur) >= 4:
        runs.append(''.join(cur))
    return runs

for path in sys.argv[1:]:
    print('='*80)
    print(path)
    ole = olefile.OleFileIO(path)
    print('STREAMS:', ole.listdir())
    for entry in ole.listdir():
        name = '/'.join(entry)
        try:
            data = ole.openstream(entry).read()
        except Exception as e:
            print(' skip', name, e)
            continue
        if 'WordDocument' == entry[-1]:
            print('--- WordDocument len', len(data))
        if '1Table' == entry[-1] or '0Table' == entry[-1]:
            print('--- Table', name, len(data))
        # try to find text
        if entry[-1] in ('WordDocument','1Table','0Table'):
            runs = find_text(data)
            for r in runs:
                if any(c.isalpha() for c in r) or any('0' <= c <= '9' for c in r):
                    print(f'  [{name}] {r[:200]}')
    ole.close()
