const katex = require('katex');

function isolateMathVariables(text) {
    if (!text || typeof text !== 'string') return '';
    let clean = text;

    // Replace $ ... $ math blocks that contain regular multi-letter English words
    clean = clean.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
        // If the expression is just a single number/variable (e.g. $x$, $120$, $x+3$, $\frac{a}{b}$), keep it as math!
        if (/^(?:\\[a-zA-Z]+|\{.*?\}|\(?[a-zA-Z0-9\+\-\*\/\=\<\>\le\ge\^\.]+\)?)$/.test(expr.trim())) {
            return match;
        }

        // If the expression contains English words (like "speed of x", "written as", "total profit"),
        // unwrap the English words and only wrap isolated math terms in $...$
        return expr.replace(/\b([a-zA-Z]{2,})\b/g, (word) => {
            // Keep common LaTeX command words as math
            if (/^(frac|sqrt|times|div|pm|alpha|beta|theta|pi|le|ge|neq|approx|text|cdot|infty)$/.test(word)) {
                return word;
            }
            // Multi-letter English word found inside math mode -> pull it out into plain text!
            return `$$$END_MATH$$ ${word} $$$START_MATH$$`;
        })
        .replace(/\$\$\$START_MATH\$\$\s*\$\$\$END_MATH\$\$/g, '')
        .replace(/\$\$\$END_MATH\$\$\s*\$\$\$START_MATH\$\$/g, '');
    });

    return clean;
}

const badInput = "A motorist travels at a $speed of x km/h$ and the $total profit was 160$ written as $2x+3=7$.";
console.log('Testing Word Isolation:');
const result = isolateMathVariables(badInput);
console.log('Isolated Output:\n', result);
