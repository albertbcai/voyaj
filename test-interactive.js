#!/usr/bin/env node

// Interactive test script for Voyaj
// Simulates sending messages to the bot

import readline from 'readline';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3002';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let groupId = `test-group-${Date.now()}`;
let currentPhone = '+15551111111';

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function sendMessage(phone, body) {
  try {
    const response = await fetch(`${BASE_URL}/test/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: phone, body, groupId }),
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error sending message:', error.message);
    return null;
  }
}

async function main() {
  console.log('🧪 Voyaj Interactive Test Mode\n');
  console.log('This simulates sending messages to the bot.');
  console.log('Bot responses will appear in the server log.\n');
  console.log(`Group ID: ${groupId}`);
  console.log(`Current phone: ${currentPhone}\n`);
  console.log('Commands:');
  console.log('  - Type a message to send it');
  console.log('  - /phone <number> - Change phone number');
  console.log('  - /group <id> - Change group ID');
  console.log('  - /reset - Start new trip');
  console.log('  - /exit - Quit\n');
  console.log('Watch bot responses: tail -f /tmp/voyaj-server.log | grep "MOCK SMS"\n');

  while (true) {
    const input = await prompt(`[${currentPhone}] > `);

    if (!input.trim()) continue;

    // Handle commands
    if (input.startsWith('/exit')) {
      console.log('👋 Goodbye!');
      rl.close();
      break;
    }

    if (input.startsWith('/phone ')) {
      currentPhone = input.split(' ')[1] || currentPhone;
      console.log(`📱 Phone number set to: ${currentPhone}\n`);
      continue;
    }

    if (input.startsWith('/group ')) {
      groupId = input.split(' ').slice(1).join(' ') || groupId;
      console.log(`👥 Group ID set to: ${groupId}\n`);
      continue;
    }

    if (input.startsWith('/reset')) {
      groupId = `test-group-${Date.now()}`;
      console.log(`🔄 New group: ${groupId}\n`);
      continue;
    }

    // Send message
    console.log(`📤 Sending: "${input}"`);
    const result = await sendMessage(currentPhone, input);
    
    if (result) {
      console.log(`✅ Message sent (Trip ID: ${result.tripId})\n`);
      console.log('💡 Check server log for bot response:');
      console.log('   tail -f /tmp/voyaj-server.log | grep "MOCK SMS"\n');
    } else {
      console.log('❌ Failed to send message\n');
    }
  }
}

main().catch(console.error);




