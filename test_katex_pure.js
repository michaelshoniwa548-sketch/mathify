const katex = require('katex');

function renderPureKaTeXText(text) {
    if (!text) return '';

    // First: replace display math $$ ... $$
    let result = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, expr) => {
        try {
            return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
        } catch (e) {
            return match;
        }
    });

    // Second: replace inline math $ ... $
    result = result.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
        try {
            return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false });
        } catch (e) {
            return match;
        }
    });

    // Third: Catch any un-delimited LaTeX commands like \frac{a}{b}, \sqrt{a}, \theta, etc.
    result = result.replace(/\\(frac|sqrt|times|div|pm|alpha|beta|theta|pi|int|sum|vec|le|ge|neq|approx)\{([^}]+)\}(\{([^}]+)\})?/g, (match) => {
        try {
            return katex.renderToString(match, { displayMode: false, throwOnError: false });
        } catch (e) {
            return match;
        }
    });

    return result;
}

const sampleQuestion = "Simplify the algebraic fraction: $$\\frac{3x^2 - 12}{x^2 + x - 6}$$ and solve $2x^2 - 5x - 3 = 0$. Also find \\sqrt{16}.";

console.log('Testing Pure KaTeX HTML Generation...');
const renderedHtml = renderPureKaTeXText(sampleQuestion);
console.log('Rendered HTML length:', renderedHtml.length);
console.log('Contains KaTeX HTML classes?:', renderedHtml.includes('katex'));
console.log('Contains raw \\frac text?:', renderedHtml.includes('\\frac'));
