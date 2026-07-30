function fixLaTeXInJson(rawText) {
    let cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Replace single backslashes in LaTeX commands with double backslashes
    // We target backslashes that are followed by letters or common LaTeX symbols
    let fixed = cleanJson.replace(/\\([a-zA-Z0-9_\{\}\(\)\[\]\+\-\*\/\=\<\>\!\,\.\:\;\@\#\$\%\^\&\~])/g, '\\\\$1');
    
    // Restore valid JSON escapes (\", \\, \/)
    fixed = fixed.replace(/\\\\"/g, '\\"');
    
    return fixed;
}

const badJsonStr = `{
  "quiz": [
    { "id": 1, "question": "Solve \\frac{x^2 - 4}{2} = 0 for \\theta where \\pi = 3.14." },
    { "id": 2, "question": "Calculate \\sqrt{16} + \\times 5." }
  ]
}`;

console.log('Original JSON parse:');
try {
    JSON.parse(badJsonStr);
} catch(e) {
    console.error('Error:', e.message);
}

console.log('\nFixed JSON parse:');
try {
    const fixed = fixLaTeXInJson(badJsonStr);
    console.log('Fixed String:', fixed);
    const parsed = JSON.parse(fixed);
    console.log('✅ PARSED SUCCESSFULLY! Quiz question 1:', parsed.quiz[0].question);
} catch(e) {
    console.error('Error parsing fixed:', e.message);
}
