#!/usr/bin/env node

// Challenging group chat test - edge cases and ambiguous messages

const BASE_URL = process.env.TEST_URL || 'http://localhost:3002';
const GROUP_ID = `challenge-${Date.now()}`;

// Use completely fresh phone numbers
const phones = {
  sarah: `+1555${Math.floor(Math.random() * 10000000)}`,
  mike: `+1555${Math.floor(Math.random() * 10000000)}`,
  alex: `+1555${Math.floor(Math.random() * 10000000)}`,
  jess: `+1555${Math.floor(Math.random() * 10000000)}`,
};

async function sendMessage(phone, body, delay = 2000) {
  console.log(`\n📤 [${phone.substring(8)}] "${body}"`);
  
  const response = await fetch(`${BASE_URL}/test/sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: phone, body, groupId: GROUP_ID }),
  });
  
  const result = await response.json();
  await new Promise(resolve => setTimeout(resolve, delay));
  return result;
}

async function runChallengingTest() {
  console.log('🧪 CHALLENGING GROUP CHAT TEST');
  console.log('='.repeat(50));
  console.log(`Group ID: ${GROUP_ID}`);
  console.log(`\n💡 Watch bot responses: tail -f /tmp/voyaj-server.log | grep "MOCK SMS"`);
  console.log('='.repeat(50));
  
  // Phase 1: Ambiguous introductions
  console.log('\n📱 PHASE 1: Ambiguous Introductions');
  await sendMessage(phones.sarah, "hey");
  await sendMessage(phones.mike, "what's up");
  await sendMessage(phones.alex, "hi everyone");
  await sendMessage(phones.jess, "Jess here");
  
  // Phase 2: Vague destination suggestions
  console.log('\n🗺️  PHASE 2: Vague Destination Discussion');
  await sendMessage(phones.sarah, "where should we go?");
  await sendMessage(phones.mike, "idk maybe japan?");
  await sendMessage(phones.alex, "tokyo");
  await sendMessage(phones.jess, "or seoul?");
  await sendMessage(phones.sarah, "tokyo is cool");
  await sendMessage(phones.mike, "yeah tokyo");
  await sendMessage(phones.alex, "tokyo");
  await sendMessage(phones.jess, "seoul");
  
  // Phase 3: Unclear date preferences
  console.log('\n❓ PHASE 3: Unclear Date Preferences');
  await sendMessage(phones.sarah, "when?");
  await sendMessage(phones.mike, "spring?");
  await sendMessage(phones.alex, "march");
  await sendMessage(phones.jess, "april works");
  await sendMessage(phones.sarah, "march 10-17");
  await sendMessage(phones.mike, "march 15-22");
  await sendMessage(phones.alex, "march 10-17");
  await sendMessage(phones.jess, "march 15-22");
  
  // Phase 4: Various flight booking formats
  console.log('\n✈️  PHASE 4: Various Flight Formats');
  await sendMessage(phones.sarah, "booked AA154");
  await sendMessage(phones.mike, "I got United 456");
  await sendMessage(phones.alex, "just booked");
  await sendMessage(phones.jess, "my flight is Delta 789");
  
  // Phase 5: Questions and clarifications
  console.log('\n💬 PHASE 5: Questions & Clarifications');
  await sendMessage(phones.sarah, "who's coming?");
  await sendMessage(phones.mike, "what's the plan?");
  await sendMessage(phones.alex, "where are we staying?");
  await sendMessage(phones.jess, "do we need visas?");
  
  // Phase 6: Changing minds
  console.log('\n🔄 PHASE 6: Changing Minds');
  await sendMessage(phones.sarah, "actually maybe seoul instead");
  await sendMessage(phones.mike, "nah tokyo is better");
  
  // Phase 7: Casual conversation mixed with info
  console.log('\n💭 PHASE 7: Mixed Conversation');
  await sendMessage(phones.alex, "excited!");
  await sendMessage(phones.jess, "me too");
  await sendMessage(phones.sarah, "this is going to be fun");
  await sendMessage(phones.mike, "can't wait");
  
  console.log('\n✅ Challenging test complete!');
  console.log(`\nCheck bot responses in: tail -f /tmp/voyaj-server.log | grep "MOCK SMS"`);
}

runChallengingTest().catch(console.error);



