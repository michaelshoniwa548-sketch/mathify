const toolRegistry = require('./services/toolRegistry');
const auditService = require('./services/auditService');
const heartbeatService = require('./services/heartbeatService');
const fs = require('fs');
const path = require('path');

async function testRails() {
    console.log('--- 1. Testing Hard Confirmation Gate ---');
    const res1 = await toolRegistry.executeTool('modify_system_setting', {
        setting_name: 'theme',
        new_value: 'dark_mode'
    });

    console.log('Tool Call Result (Expecting requiresConfirmation):', res1);
    if (!res1.requiresConfirmation || !res1.pendingActionId) {
        throw new Error('Consequential tool should require user confirmation!');
    }

    console.log('\n--- 2. Testing Action Denial ---');
    const denyRes = await toolRegistry.confirmAction(res1.pendingActionId, false);
    console.log('Deny Result:', denyRes);
    if (denyRes.status !== 'denied') throw new Error('Action should have been denied');

    console.log('\n--- 3. Testing Action Approval ---');
    const res2 = await toolRegistry.executeTool('modify_system_setting', {
        setting_name: 'theme',
        new_value: 'dark_mode'
    });
    const approveRes = await toolRegistry.confirmAction(res2.pendingActionId, true);
    console.log('Approve Result:', approveRes);
    if (approveRes.status !== 'approved_and_executed') throw new Error('Action should have been approved and executed');

    console.log('\n--- 4. Testing Audit Logging & Cost Tracking ---');
    auditService.logEvent({ type: 'test_turn', details: { query: 'Solve algebra' }, estimatedCost: 0.0005 });
    const logs = auditService.loadAuditLogs();
    const totalCost = auditService.getTotalCostTally();
    console.log(`Audit log has ${logs.length} entries. Total estimated cost tally: $${totalCost}`);
    if (logs.length === 0 || totalCost <= 0) throw new Error('Audit log / cost tally failed!');

    console.log('\n--- 5. Testing Kill Switch ---');
    const configPath = path.join(__dirname, 'config.json');
    const originalConfig = fs.readFileSync(configPath, 'utf8');

    // Turn kill switch ON
    const configObj = JSON.parse(originalConfig);
    configObj.killSwitch = true;
    fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2), 'utf8');

    await heartbeatService.evaluateChecks(); // Should print kill switch active log and pause

    // Restore original config
    fs.writeFileSync(configPath, originalConfig, 'utf8');

    console.log('\n✅ All Tier 6 Rails tests passed successfully!');
}

testRails().catch(err => {
    console.error('❌ Rails Test failed:', err);
    process.exit(1);
});
