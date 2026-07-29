const toolRegistry = require('./services/toolRegistry');

async function testRegistry() {
    console.log('--- 1. Testing getToolDeclarations ---');
    const decls = toolRegistry.getToolDeclarations();
    console.log(`Registered ${decls.length} tools:`, decls.map(d => d.name));
    if (decls.length !== 3) throw new Error('Expected 3 registered tools');

    console.log('\n--- 2. Testing solve_math_problem execution ---');
    const res1 = await toolRegistry.executeTool('solve_math_problem', { problem: '2x + 5 = 15', topic: 'Algebra' });
    console.log('Result 1:', res1);
    if (!res1.success || !res1.output.solution_summary) throw new Error('solve_math_problem failed');

    console.log('\n--- 3. Testing lookup_math_concept execution ---');
    const res2 = await toolRegistry.executeTool('lookup_math_concept', { topic: 'Quadratic Equations', level: 'O-Level' });
    console.log('Result 2:', res2);
    if (!res2.success || !res2.output.key_formulas.length) throw new Error('lookup_math_concept failed');

    console.log('\n--- 4. Testing generate_practice_question execution ---');
    const res3 = await toolRegistry.executeTool('generate_practice_question', { topic: 'Trigonometry', difficulty: 'hard' });
    console.log('Result 3:', res3);
    if (!res3.success || !res3.output.question) throw new Error('generate_practice_question failed');

    console.log('\n--- 5. Testing error handling for unknown tool ---');
    const res4 = await toolRegistry.executeTool('unknown_tool', {});
    console.log('Result 4 (Expected failure):', res4);
    if (res4.success) throw new Error('Unknown tool should have failed');

    console.log('\n✅ All Tool Registry tests passed successfully!');
}

testRegistry().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
