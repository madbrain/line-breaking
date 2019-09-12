
import * as _ from 'lodash';

export interface HyphenateListener {
    onStart(word: string): void;
    onMatch(position: number, word: string): void;
    onEnd(word: string): void;
}

class NullListener implements HyphenateListener {
    onStart(word: string) {}
    onMatch(position: number, pattern: string) {}
    onEnd(word: string) {}
}

function interleave(word: string, points: Array<number>) {
    return _.map(_.zip(points, (word + " ").split('')), ([x, y]) => ""+x+y).join("");
}

export function hyphenate(tree, word: string, listener: HyphenateListener = new NullListener()) {
    const work = '.' + word.toLowerCase() + '.';
    listener.onStart(' ' + work.split('').join(' '));
    const points = _.times(work.length+1, _.constant(0));
    for (let i = 0; i < work.length; ++i) {
        let t = tree;
        let prefix = "";
        for (let n = i; n < work.length; ++n) {
            const c = work[n]
            if (t[c] == undefined) {
                break;
            }
            t = t[c];
            prefix += c;
            if (t['0']) {
                const p = t['0'];
                for (let j = 0; j < p.length; ++j) {
                    points[i+j] = Math.max(points[i+j], p[j]);
                }
                const input_word = interleave(prefix, p);
                listener.onMatch(i*2, input_word);
            }
        }
    }
    // Règles spéciale: on garde toujours au moins 2 lettre au debut et à la fin
    points[1] = points[2] = points[points.length-3] = points[points.length-2] = 0;
    const pieces = [];
    let current = "";
    for (let i = 0; i < word.length; ++i) {
        current += word[i];
        if (points[i+2] % 2 != 0) {
            pieces.push(current);
            current = "";
        }
    }
    pieces.push(current);
    listener.onEnd(interleave(work, points));
    return pieces;
}
