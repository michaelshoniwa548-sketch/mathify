function fixJsonBackslashes(cleanJson) {
    return cleanJson.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
}

const badJsonStr = `{
  "quiz": [
    { "id": 1, "question": "Solve the quadratic equation \\frac{x^2 - 4}{2} = 0 for \\theta." },
    { "id": 2, "question": "Find the integral \\int_{0}^{1} x \\, dx." }
  ]
}`;

console.log('Testing raw JSON parse (expected to fail):');
try {
    JSON.parse(badJsonStr);
    console.log('Parsed successfully!');
} catch(e) {
    console.error('Caught expected error:', e.message);
}

console.log('\nTesting sanitized JSON parse:');
try {
    const fixed = fixJsonBackslashes(badJsonStr);
    const parsed = JSON.parse(fixed);
    console.log('✅ PARSED SUCCESSFULLY! Quiz questions count:', parsed.quiz.length);
    console.log('Question 1:', parsed.quiz[0].question);
} catch(e) {
    console.error('Fix failed:', e.message);
}
