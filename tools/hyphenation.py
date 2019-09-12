
import sys
import json

tree = {}

def insert_pattern(input_word):
    pattern = []
    addZero = True
    current = tree
    for i, c in enumerate(input_word):
        if c >= '0' and c <= '9':
            pattern.append(int(c))
            addZero = False
        else:
            if addZero:
                pattern.append(0)
            if c not in current.keys():
                current[c] = {}
            current = current[c]
            addZero = True
    if addZero:
        pattern.append(0)
    current['0'] = pattern

f = open("fr.pat", "r")
for line in f:
    if not line.startswith("%"):
        insert_pattern(line.strip())
f.close()

if len(sys.argv) > 1 and sys.argv[1] == "dump":
    out = open("fr.json", "w")
    json.dump(tree, out)
    out.close()
    sys.exit(0)

def hyphenate(word):
    work = '.' + word.lower() + '.'
    print (' ' + ' '.join(work))
    points = [ 0 for x in range(len(work)+1) ]
    for i in range(len(work)):
        t = tree
        prefix = ""
        for n in range(i, len(work)):
            c = work[n]
            if c not in t:
                break
            t = t[c]
            prefix += c
            if '0' in t:
                p = t['0']
                for j,x in enumerate(p):
                    points[i+j] = max(points[i+j], x)
                input_word = "".join(map(lambda x: str(x[0])+x[1], zip(p, prefix + " ")))
                print ((" " * (i*2)) + input_word)
    # Regle spéciale on garde toujours au moins 2 lettre au debut et à la fin
    points[2] = points[-2] = 0
    pieces = [ "" ]
    for (c, x) in zip(word, points[2:-1]):
        pieces[-1] += c
        if (x % 2) != 0:
            pieces.append("")
    return ('-'.join(pieces))

print (hyphenate("anticonstitutionnellement"))

print (" ".join(map(hyphenate, "pendant les vacances d'hiver je vais skier".split(" "))))
