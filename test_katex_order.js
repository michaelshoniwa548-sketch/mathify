const marked = require('marked');
const katex = require('katex');

function formatPureKaTeX(text) {
    if (!text || typeof text !== 'string') return '';
    let processed = text;

    // Auto-fix unclosed $$ display math blocks
    const countDisplayDelims = (processed.match(/\$\$/g) || []).length;
    if (countDisplayDelims % 2 !== 0) {
        processed += '$$';
    }

    // Auto-fix unclosed $ inline math blocks
    const sansDisplay = processed.replace(/\$\$/g, '');
    const countInlineDelims = (sansDisplay.match(/\$/g) || []).length;
    if (countInlineDelims % 2 !== 0) {
        processed += '$';
    }

    // Auto-close missing braces in \frac{num}{den} if truncated
    const openBraces = (processed.match(/\{/g) || []).length;
    const closeBraces = (processed.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
        processed += '}'.repeat(openBraces - closeBraces);
    }

    // Clean bare \text{x} or \text{(x-1)} into $x$ or $(x-1)$ BEFORE parsing
    processed = processed.replace(/\\text\{([^}]+)\}/g, '$$$1$$');

    // 1. Run markdown parsing FIRST
    let html = processed;
    if (marked.parse) {
        try {
            html = marked.parse(html);
        } catch (e) {}
    }

    // 2. Run KaTeX rendering SECOND on the HTML content
    if (katex) {
        // Render display math $$ ... $$
        html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, expr) => {
            try {
                return katex.renderToString(expr.trim(), { displayMode: true, output: 'html', throwOnError: false });
            } catch (e) {
                return match;
            }
        });

        // Render inline math $ ... $
        html = html.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
            try {
                return katex.renderToString(expr.trim(), { displayMode: false, output: 'html', throwOnError: false });
            } catch (e) {
                return match;
            }
        });

        // Render bare LaTeX commands (\frac, \sqrt, etc.)
        html = html.replace(/\\(frac|sqrt|times|div|pm|alpha|beta|theta|pi|int|sum|vec|le|ge|neq|approx)(\{[^}]+\})+/g, (match) => {
            try {
                return katex.renderToString(match, { displayMode: false, output: 'html', throwOnError: false });
            } catch (e) {
                return match;
            }
        });
    }

    // Clean up any remaining loose LaTeX backslash commands
    html = html
        .replace(/\\times/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/\\pm/g, '±')
        .replace(/\\theta/g, 'θ')
        .replace(/\\pi/g, 'π')
        .replace(/\\alpha/g, 'α')
        .replace(/\\beta/g, 'β')
        .replace(/\\sqrt/g, '√');

    return html;
}

const userProblemString = "A shopkeeper bought 80 shirts at \\text{x} each. He sold 60 of them at $(x+3)$ each and the remaining 20 at \\text{(x-1)} each. If his total profit was $160, write down an equation in $x$ and solve it to find the cost price of each shirt.";

console.log('Testing User Problem String Parsing:');
const output = formatPureKaTeX(userProblemString);
console.log('Output length:', output.length);
console.log('Contains broken </span> tags?:', output.includes('</span>\\text') || output.includes('<span class="katex">('));
console.log('Clean Output Sample:\n', output);
