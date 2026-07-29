const heartbeatService = require('./services/heartbeatService');

async function testHeartbeat() {
    console.log('--- 1. Testing isQuietHours logic ---');
    const mockConfigQuiet = { quietHours: { enabled: true, start: "00:00", end: "23:59" } };
    const quietRes = heartbeatService.isQuietHours(mockConfigQuiet);
    console.log('IsQuietHours (all day):', quietRes);
    if (!quietRes) throw new Error('isQuietHours failed for all day quiet period');

    console.log('\n--- 2. Testing evaluateChecks execution ---');
    await heartbeatService.evaluateChecks();
    const notices = heartbeatService.getPendingNotices();
    console.log(`Evaluated checks. Pending notices count: ${notices.length}`);

    console.log('\n--- 3. Testing notice dismissal ---');
    if (notices.length > 0) {
        const targetId = notices[0].id;
        const dismissRes = heartbeatService.dismissNotice(targetId);
        console.log('Dismiss result:', dismissRes);
        if (!dismissRes.success) throw new Error('Failed to dismiss notice');
    } else {
        console.log('No pending notices to dismiss (check was held or not due yet).');
    }

    console.log('\n✅ All Heartbeat Service tests passed successfully!');
}

testHeartbeat().catch(err => {
    console.error('❌ Heartbeat Test failed:', err);
    process.exit(1);
});
