const katex = require('katex');

function fixTightlyPackedKaTeXWords(text) {
    if (!text || typeof text !== 'string') return '';
    let processed = text;

    // Convert multi-letter English words inside $...$ into \text{word} (e.g. $written$ -> $\text{written}$)
    processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
        // If the expression contains multi-letter words without \text{}
        const fixedExpr = expr.replace(/\b([a-zA-Z]{2,})\b/g, (word) => {
            // Do not touch LaTeX command words
            if (/^(frac|sqrt|times|div|pm|alpha|beta|theta|pi|le|ge|neq|approx|text|cdot|infty|int|sum|vec)$/.test(word)) {
                return word;
            }
            return `\\text{${word}}`;
        });
        return `$${fixedExpr}$`;
    });

    return processed;
}

const sampleBadWordStr = "The result is $written$ as an $equation$ with $speed$ of $x km/h$.";

console.log('Testing KaTeX Word Spacing Fix:');
const fixedStr = fixTightlyPackedKaTeXWords(sampleBadWordStr);
console.log('Fixed KaTeX String:\n', fixedStr);

const renderedHtml = katex.renderToString(fixedStr.match(/\$([^\$]+)\$/)[1], { displayMode: false, output: 'html' });
console.log('Rendered KaTeX HTML Sample:\n', renderedHtml.slice(0, 300));
