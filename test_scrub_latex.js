function scrubAllRawLaTeX(text) {
    if (!text || typeof text !== 'string') return '';
    let clean = text;

    // 1. Convert \frac{a}{b} -> (a)/(b)
    clean = clean.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
    
    // 2. Convert \sqrt{a} -> √(a)
    clean = clean.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');

    // 3. Convert \text{abc} -> abc
    clean = clean.replace(/\\text\{([^}]+)\}/g, '$1');

    // 4. Convert \left( and \right)
    clean = clean.replace(/\\left\(|\\right\)/g, (m) => m.includes('left') ? '(' : ')');
    clean = clean.replace(/\\left\[|\\right\]/g, (m) => m.includes('left') ? '[' : ']');

    // 5. Convert common LaTeX symbols to Unicode symbols
    clean = clean
        .replace(/\\times|\\cdot/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/\\pm/g, '±')
        .replace(/\\leq|\\le/g, '≤')
        .replace(/\\geq|\\ge/g, '≥')
        .replace(/\\neq/g, '≠')
        .replace(/\\approx/g, '≈')
        .replace(/\\alpha/g, 'α')
        .replace(/\\beta/g, 'β')
        .replace(/\\theta/g, 'θ')
        .replace(/\\pi/g, 'π')
        .replace(/\\infty/g, '∞')
        .replace(/\\quad|\\qquad/g, ' ')
        .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, '');

    // 6. Strip any residual unparsed backslashes
    clean = clean.replace(/\\([a-zA-Z]+)/g, '$1').replace(/\\/g, '');

    return clean;
}

const rawLaTeXSample = "Solve \\frac{x^2 - 4}{2x + 1} = \\sqrt{16} \\pm \\alpha for \\theta \\le \\pi where \\left( x + 3 \\right) \\quad \\text{is integer}.";

console.log('Testing Raw LaTeX Scrubber...');
const scrubbed = scrubAllRawLaTeX(rawLaTeXSample);
console.log('Scrubbed Result:\n', scrubbed);
console.log('Contains backslashes?:', scrubbed.includes('\\'));
