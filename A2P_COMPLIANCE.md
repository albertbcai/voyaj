# A2P 10DLC Compliance Documentation

This document contains the complete A2P 10DLC campaign application details submitted to Twilio.

## Campaign Details

### Campaign Description
```
Voyaj coordinates group trips via SMS. Users initiate contact by visiting our opt-in page and entering their phone number to start planning a trip with friends. We send transactional messages to facilitate group decision-making including destination voting, date coordination, lodging selection, payment tracking, and flight booking confirmations. All participants have explicitly opted in through our web form before receiving any messages.
```

### Phone Number
+1 (878) 888-6925

### Opt-In Page URL
https://voyaj.app/opt-in

## Message Samples

### Sample Message #1
```
Welcome to Voyaj! 🎉 I'll help coordinate your group trip via SMS. Reply with your name to join. Once we have 2+ people, we'll start planning! Message frequency varies. Msg & data rates may apply. Reply STOP to opt-out, HELP for help. Privacy: voyaj.app/privacy | Terms: voyaj.app/terms
```

### Sample Message #2
```
Voyaj: Portugal wins! (3 votes) ✈️ Now let's find dates. Reply with your available dates in format MM/DD - MM/DD. Example: 07/15 - 07/22
```

### Sample Message #3
```
Great! Here are lodging options for Portugal July 15-22: 1️⃣ Beach house $300/person 2️⃣ Downtown apt $350/person 3️⃣ Villa with pool $400/person. Vote with just the number (1, 2, or 3)
```

### Sample Message #4
```
Time to book flights! ✈️ When you've booked, text: BOOKED [airline]. Example: BOOKED United. Don't wait - prices go up daily!
```

### Sample Message #5
```
🎉 Everyone's booked! Portugal July 15-22 is happening. I'll check in 2 weeks before departure to help with final logistics. Reply STOP anytime to opt-out.
```

## Message Contents
- ✅ Messages will include embedded links
- ✅ Messages will include phone numbers
- ❌ Messages include content related to direct lending or other loan arrangement
- ❌ Messages include age-gated content

## Opt-In Process

### How do end-users consent to receive messages?

```
End users opt-in via two methods: (1) web form at https://voyaj.app/opt-in, or (2) text START to +1 (878) 888-6925.

METHOD 1 - WEB FORM:

User visits https://voyaj.app/opt-in (public, no login), enters phone number, checks consent checkbox: "I consent to receive SMS from Voyaj for trip coordination. Message frequency varies based on trip planning activity. Messages are transactional. Message and data rates may apply. Reply STOP to unsubscribe, HELP for help." Clicks "Start Planning" and receives welcome SMS.

METHOD 2 - KEYWORD:

User sees phone number +1 (878) 888-6925 and instruction "Text START to get started" displayed on https://voyaj.app/opt-in (publicly accessible page). User texts START to +1 (878) 888-6925. Receives: "Welcome to Voyaj! You are now opted-in to receive SMS messages for trip coordination. Message frequency varies based on trip planning activity. Message and data rates may apply. Reply STOP to unsubscribe, HELP for help. Privacy: voyaj.app/privacy | Terms: voyaj.app/terms"

REQUIRED DISCLOSURES (on page and in confirmation):

Brand: Voyaj. Frequency: varies based on activity, transactional. Privacy: voyaj.app/privacy. Terms: voyaj.app/terms. Data rates: may apply. Opt-out: Reply STOP. Help: Reply HELP.

VERIFICATION:

https://voyaj.app/opt-in is public with all disclosures. Checkbox unchecked by default. No unsolicited messages. All transactional for trip coordination.

MESSAGES:

Welcome, member confirmations, voting prompts/results, flight tracking, payment coordination, status updates, nudges.

OPT-OUT:

Text STOP, CANCEL, END, QUIT, UNSUBSCRIBE, or OPTOUT. Re-subscribe: START. Help: HELP or INFO.
```

### Opt-in Keywords
```
START
```

### Opt-in Message
```
Welcome to Voyaj! You are now opted-in to receive SMS messages for trip coordination. Message frequency varies based on trip planning activity. Message and data rates may apply. Reply STOP to unsubscribe, HELP for help. Privacy: voyaj.app/privacy | Terms: voyaj.app/terms
```

## Required Disclosures

All of the following are displayed on the opt-in page (https://voyaj.app/opt-in) and included in the keyword opt-in confirmation message:

- **Brand identification:** Voyaj - Group Trip Coordinator
- **Message frequency:** Varies based on trip planning activity and coordination needs. Messages are transactional and sent in response to user actions or when coordination updates are required.
- **Privacy Policy:** https://voyaj.app/privacy (clickable link)
- **Terms of Service:** https://voyaj.app/terms (clickable link)
- **Data rates:** Message and data rates may apply
- **Opt-out instructions:** Reply STOP to unsubscribe
- **Help instructions:** Reply HELP for help

## Opt-Out Keywords

Users can opt-out by texting any of the following:
- STOP
- CANCEL
- END
- QUIT
- UNSUBSCRIBE
- OPTOUT

Users can re-subscribe by texting: START

Users can get help by texting: HELP or INFO

## Notes

- The opt-in page is publicly accessible (no login required)
- The consent checkbox is unchecked by default
- We NEVER send unsolicited messages
- All messaging is transactional and related to trips that users are actively planning
- Message types include: welcome messages, member confirmations, voting prompts/results, flight tracking, payment coordination, status updates, and coordination nudges

## Future Implementation

Once A2P approval is received, the following code changes should be implemented:

1. **STOP/HELP keyword handling** in `src/server.js` - Check for opt-out/help keywords before processing messages
2. **Opt-out tracking** in database - Add `opt_outs` table to track opted-out users
3. **Updated welcome message** in `src/agents/coordinator.js` - Include full compliance text matching the opt-in message
4. **Prevent messages to opted-out users** - Check opt-out status before sending any SMS
