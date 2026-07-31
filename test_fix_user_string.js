const katex = require('katex');

function sanitizeTextWithMath(text) {
    if (!text || typeof text !== 'string') return '';
    let clean = text;

    // 1. If an inline math block $...$ contains space-separated English words, unwrap the sentence
    clean = clean.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
        // If the expression contains 2 or more space-separated English words (e.g. "at an average speed of", "and a width of")
        if (/\b[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\b/.test(expr)) {
            // It's a sentence accidentally wrapped in $...$! Unwrap it and wrap only variables/equations
            return expr.replace(/\b([a-zA-Z0-9_\+\-\*\/\=\(\)\{\}\^]+)\b/g, (m) => {
                // If it looks like a variable or math term (e.g. x, x+3, x-2, 120km), leave as math
                if (/^(?:[a-zA-Z]|[0-9]+[a-zA-Z]+|\(?[xYzabc0-9\+\-\*\/\^]+\)?)$/.test(m)) {
                    return `$${m}$`;
                }
                return m;
            });
        }
        return match;
    });

    // 2. Protect currency
    clean = clean.replace(/\$(\d+(?:\.\d+)?)\b/g, '&#36;$1');

    // 3. Render KaTeX safely and strip any red error spans
    clean = clean.replace(/\$\$([\s\S]+?)\$\$/g, (match, expr) => {
        try {
            const html = katex.renderToString(expr.trim(), { displayMode: true, output: 'html', throwOnError: false });
            return html.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');
        } catch (e) {
            return expr;
        }
    });

    clean = clean.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
        try {
            const html = katex.renderToString(expr.trim(), { displayMode: false, output: 'html', throwOnError: false });
            return html.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');
        } catch (e) {
            return expr;
        }
    });

    return clean;
}

const userProblemQ19 = "Question 19: A motorist travels a distance of $120km at an average speed of x km/h. On the return journey, the speed is increased by 20km/h and the time taken is 30 minutes less. Write down an equation in x to represent this information.$";
const userProblemQ26 = "Question 26: A rectangular garden has a length of $(x+5) m' and a width of(x - 2)m. If the area of the garden is 60 m^2, form an equation in x and solve it to find the dimensions of the garden.$";

console.log('--- TEST Q19 RESULT ---');
const res19 = sanitizeTextWithMath(userProblemQ19);
console.log('Contains katex-error red span?:', res19.includes('katex-error') || res19.includes('cc0000'));
console.log('Clean Output Sample 19:\n', res19.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

console.log('\n--- TEST Q26 RESULT ---');
const res26 = sanitizeTextWithMath(userProblemQ26);
console.log('Contains katex-error red span?:', res26.includes('katex-error') || res26.includes('cc0000'));
console.log('Clean Output Sample 26:\n', res26.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
