const katex = require('katex');

function formatPureKaTeX(text) {
    if (!text || typeof text !== 'string') return '';
    let processed = text;

    // 1. Un-escape HTML entities if double-encoded
    processed = processed
        .replace(/&amp;#36;/g, '$')
        .replace(/&#36;/g, '$')
        .replace(/&amp;lt;/g, '<')
        .replace(/&amp;gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

    // 2. Strip raw HTML list tags outputted by Gemini (e.g. <ol>, <li>, <ul>, </ol>, </li>, </ul>)
    processed = processed
        .replace(/<\/?(ol|ul|li|p|div|span)[^>]*>/gi, '\n');

    // 3. Fix unclosed single $ delimiters around single numbers or variables (e.g. $3, $0, $6)
    // If $ is followed by digits or a single variable and a space/punctuation without a closing $, convert to $number$
    processed = processed.replace(/\$([0-9a-zA-Z\+\-\*\/]+)(?=\s|[\,\.\:\;\!\?]|$)(?!\$)/g, '$$$1$$');

    // 4. Auto-fix unclosed $$ display math blocks
    const countDisplayDelims = (processed.match(/\$\$/g) || []).length;
    if (countDisplayDelims % 2 !== 0) {
        processed += '$$';
    }

    // 5. Auto-fix unclosed $ inline math blocks
    const sansDisplay = processed.replace(/\$\$/g, '');
    const countInlineDelims = (sansDisplay.match(/\$/g) || []).length;
    if (countInlineDelims % 2 !== 0) {
        processed += '$';
    }

    // 6. Clean bare \text{x} or \text{(x-1)} into $x$ or $(x-1)$
    processed = processed.replace(/\\text\{([^}]+)\}/g, '$$$1$$');

    // 7. Render display math $$ ... $$ via KaTeX
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, expr) => {
        try {
            const html = katex.renderToString(expr.trim(), { displayMode: true, output: 'html', throwOnError: false });
            return html.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');
        } catch (e) {
            return expr;
        }
    });

    // 8. Render inline math $ ... $ via KaTeX
    processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
        try {
            const html = katex.renderToString(expr.trim(), { displayMode: false, output: 'html', throwOnError: false });
            return html.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');
        } catch (e) {
            return expr;
        }
    });

    // 9. Render bare un-delimited LaTeX commands (\frac, \sqrt, \theta, \pi, etc.)
    processed = processed.replace(/\\(frac|sqrt|times|div|pm|alpha|beta|theta|pi|int|sum|vec|le|ge|neq|approx)(\{[^}]+\})+/g, (match) => {
        try {
            const html = katex.renderToString(match, { displayMode: false, output: 'html', throwOnError: false });
            return html.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');
        } catch (e) {
            return match;
        }
    });

    // 10. Clean up any loose LaTeX commands
    processed = processed
        .replace(/\\times/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/\\pm/g, '±')
        .replace(/\\theta/g, 'θ')
        .replace(/\\pi/g, 'π')
        .replace(/\\alpha/g, 'α')
        .replace(/\\beta/g, 'β')
        .replace(/\\sqrt/g, '√');

    // Final safety strip of katex-error red spans
    return processed.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');
}

const sampleUserPastedBug = "These numbers are &#36;3 and −2. Divide all parts by &#36;2. $54 ÷ 3 = 18 remainder &#36;0. <ol><li>t_1 = \\frac{180}{x} [B1]</li></ol>";

console.log('Testing Final Fix on User Bug String...');
const fixedOutput = formatPureKaTeX(sampleUserPastedBug);
console.log('Contains &#36; literal?:', fixedOutput.includes('&#36;'));
console.log('Contains <ol> or <li> raw HTML tags?:', fixedOutput.includes('<ol>') || fixedOutput.includes('<li>'));
console.log('Contains katex HTML spans?:', fixedOutput.includes('katex'));
console.log('Fixed Output Sample:\n', fixedOutput.slice(0, 400));
