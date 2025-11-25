// Full trip flow test script
// Simulates a complete trip planning flow
// Uses built-in fetch (Node 18+)

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

const phoneNumbers = [
  '+15551234567', // Sarah
  '+15551234568', // Mike
  '+15551234569', // Alex
  '+15551234570', // Jordan
];

async function sendMessage(from, body, groupId) {
  const response = await fetch(`${BASE_URL}/test/sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, body, groupId }),
  });
  return response.json();
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFullTripFlow() {
  console.log('🧪 Testing full trip flow...\n');

  const groupId = `test-group-${Date.now()}`;

  try {
    // Step 1: First member joins
    console.log('1️⃣  Sarah joins...');
    await sendMessage(phoneNumbers[0], 'Sarah', groupId);
    await sleep(500);

    // Step 2: Other members join
    console.log('2️⃣  Mike joins...');
    await sendMessage(phoneNumbers[1], 'Mike', groupId);
    await sleep(500);

    console.log('3️⃣  Alex joins...');
    await sendMessage(phoneNumbers[2], 'Alex', groupId);
    await sleep(500);

    console.log('4️⃣  Jordan joins...');
    await sendMessage(phoneNumbers[3], 'Jordan', groupId);
    await sleep(1000);

    // Step 3: Destination voting
    console.log('\n🗳️  Destination voting...');
    await sendMessage(phoneNumbers[0], 'Tokyo', groupId);
    await sleep(500);
    await sendMessage(phoneNumbers[1], 'Tokyo', groupId);
    await sleep(500);
    await sendMessage(phoneNumbers[2], 'Bali', groupId);
    await sleep(500);
    await sendMessage(phoneNumbers[3], 'Tokyo', groupId);
    await sleep(1000);

    // Step 4: Date voting
    console.log('\n📅 Date voting...');
    await sendMessage(phoneNumbers[0], 'March 15-22', groupId);
    await sleep(500);
    await sendMessage(phoneNumbers[1], 'March 15-22', groupId);
    await sleep(500);
    await sendMessage(phoneNumbers[2], 'April 5-12', groupId);
    await sleep(500);
    await sendMessage(phoneNumbers[3], 'March 15-22', groupId);
    await sleep(1000);

    // Step 5: Flight tracking
    console.log('\n✈️  Flight tracking...');
    await sendMessage(phoneNumbers[0], 'I booked AA 154', groupId);
    await sleep(500);
    await sendMessage(phoneNumbers[1], 'I booked UA 456', groupId);
    await sleep(500);
    await sendMessage(phoneNumbers[2], 'I booked', groupId);
    await sleep(500);
    await sendMessage(phoneNumbers[3], 'I booked DL 789', groupId);
    await sleep(1000);

    console.log('\n✅ Full trip flow test complete!');
    console.log('\nCheck the console output above for bot responses.');
    console.log('All messages were sent to the mock Twilio client.');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test
testFullTripFlow();

