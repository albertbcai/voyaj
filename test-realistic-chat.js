#!/usr/bin/env node

// Realistic group chat test - simulates actual conversation patterns

const BASE_URL = process.env.TEST_URL || 'http://localhost:3002';
const GROUP_ID = `real-chat-${Date.now()}`;

// Use completely fresh phone numbers
const phones = {
  sarah: `+1555${Math.floor(Math.random() * 10000000)}`,
  mike: `+1555${Math.floor(Math.random() * 10000000)}`,
  alex: `+1555${Math.floor(Math.random() * 10000000)}`,
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

async function runRealisticTest() {
  console.log('🧪 REALISTIC GROUP CHAT TEST');
  console.log('='.repeat(50));
  console.log(`Group ID: ${GROUP_ID}`);
  console.log(`\n💡 Watch bot responses: tail -f /tmp/voyaj-server.log | grep "MOCK SMS"`);
  console.log('='.repeat(50));
  
  // Phase 1: Casual introductions
  console.log('\n📱 PHASE 1: Casual Introductions');
  await sendMessage(phones.sarah, "hey everyone");
  await sendMessage(phones.sarah, "I'm Sarah");
  await sendMessage(phones.mike, "Mike here 👋");
  await sendMessage(phones.alex, "Alex");
  
  // Phase 2: Destination discussion (casual)
  console.log('\n🗺️  PHASE 2: Destination Discussion');
  await sendMessage(phones.sarah, "what about tokyo?");
  await sendMessage(phones.mike, "yeah tokyo sounds good");
  await sendMessage(phones.alex, "or maybe bali?");
  await sendMessage(phones.sarah, "tokyo");
  await sendMessage(phones.mike, "tokyo");
  await sendMessage(phones.alex, "bali");
  
  // Phase 3: Questions and clarifications
  console.log('\n❓ PHASE 3: Questions & Clarifications');
  await sendMessage(phones.mike, "when are we going?");
  await sendMessage(phones.sarah, "march works for me");
  await sendMessage(phones.alex, "march is good");
  await sendMessage(phones.mike, "march 15-22");
  
  // Phase 4: Flight booking (various formats)
  console.log('\n✈️  PHASE 4: Flight Booking');
  await sendMessage(phones.sarah, "just booked my flight, AA 154 lands at 2pm");
  await sendMessage(phones.mike, "i booked mine too");
  await sendMessage(phones.alex, "who has booked flights?");
  await sendMessage(phones.mike, "UA 456");
  await sendMessage(phones.alex, "I booked DL 789");
  
  // Phase 5: Casual conversation
  console.log('\n💬 PHASE 5: Casual Conversation');
  await sendMessage(phones.sarah, "sounds good");
  await sendMessage(phones.mike, "excited!");
  await sendMessage(phones.alex, "me too");
  
  console.log('\n✅ Test complete!');
  console.log(`\nCheck bot responses in: tail -f /tmp/voyaj-server.log | grep "MOCK SMS"`);
}

runRealisticTest().catch(console.error);



