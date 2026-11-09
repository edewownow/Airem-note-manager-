/**
 * The labelled sentences behind scripts/intent-measure.ts AND MemoAirem's own small intent model
 * (scripts/intent-model/train.ts). Every list here is real test data or WRITTEN for measurement —
 * add sentences from the "What MemoAirem missed" export here, with the right label.
 */

// from scripts/voice-corpus.ts CASES (82 labelled saves) — copied so this file runs on its own
export const CORPUS_SAVES = [
  'buy a bread on your way home', 'get toothpaste', 'call mom tomorrow at 9', 'pick up laundry', 'I need to renew my SID', "don't forget the passport",
  'remember to bring the white gloves', 'text Sam about the shift swap', 'pay the internet bill on Friday', 'send money home on payday',
  'tell the maitre d about table 12', 'ask the head waiter for a day off', 'top up the crew card', 'book flights home', 'order new shoes',
  'change the bedsheets', 'wash my uniform', 'I have to submit the timesheet by 5 pm', 'I should water the plants', 'make sure to lock the cabin',
  'go to the bank tomorrow', 'need milk', 'I need milk and eggs', 'buy 2 bottles of water tomorrow', 'I gotta fix the printer', 'must sign the contract',
  'get a haircut on Saturday', 'okay um buy batteries', 'also call the agency', 'see the doctor about my back', 'email the crew office',
  'Buy sunscreen before Cozumel', 'charge my phone', 'print the boarding pass', 'return the library book', 'cancel the gym membership',
  'dinner with Sam on Friday at 7', 'crew party tomorrow night at 11 pm on the open deck', 'dentist appointment Thursday at 3 pm', 'boat drill tomorrow at 10 am',
  'meeting with the restaurant manager at 4 pm', 'lifeboat drill on Monday', 'port day in Cozumel on October 30', 'my flight home is on December 15',
  'shift starts at 6 am', 'training at 2:30', 'inspection next Tuesday at 9', "Sam's birthday on November 3", 'coffee with Priya tomorrow morning',
  'movie in the crew bar tonight at 8', 'meet Sam at the gangway at 5 pm', 'go to the dentist on Thursday at 3', 'visit the clinic tomorrow at 10 am',
  'team briefing every day at 4 pm', 'sign on in Miami on 3rd November', 'tonight at 9 buffet closing party', 'the gala dinner is on Saturday',
  'penfolds chardonnay is 25$', 'the wine list is on page 2', 'Sam likes his coffee black', 'table 12 is allergic to nuts', 'the Wi-Fi password is crew2026',
  'deck 5 has the crew gym', 'cabin 4123 is my new cabin', "Monday's menu has lobster", "the captain's name is John Smith", 'I paid 40 dollars for lunch yesterday',
  'my favorite wine is the 2018 Barolo', 'the price of Moet is 120 dollars', '7 tables in my station', 'buy-in for the poker night is 50', 'check out time is 10 am',
  'pick up point is deck 2', 'get well card from the team was lovely', 'the guest in 8012 wants extra pillows', 'Opus One 2019 costs 450 dollars a bottle',
  'call sign of the ship is ZCDF4', 'order of service is soup then salad', 'great sunset at sea today', 'the new sommelier is from Portugal', 'booking reference is XK7P2',
  'Friday is formal night',
];
// other saves already in the tests (voice-corpus ID / card / normal-stays-normal; private-asr saves)
export const TEST_SAVES = [
  'my SSS number is 34-1234567-8', 'save my TIN 123-456-789-000', 'PhilHealth number 12-345678901-2', 'pag ibig MID 1234-5678-9012', 'my passport number is P1234567A',
  'pay my SSS contribution on the 10th', 'my passport expires in March 2030', 'remind me to update my PhilHealth', 'renew passport on Friday', 'SSS office opens at 8',
  'save my pag ibig id no.', 'save my passport no.', 'save my SSS number', 'save my tin', 'add my philhealth no.',
  'save the SSS contribution receipt', 'add my passport renewal to the schedule', 'save dinner with Sam on Friday', 'remind me to renew my passport',
  'save my bank card no.', 'save my crew ID number', 'save my BDO account number 1234-5678-90', 'save the room number 8012 for the guest',
  'remind me to save the table number', 'set schedule meeting number 2 at 3 pm', 'note the cabin number is 4123', 'remind me to change my password',
  'Save my SRB now.', 'Save my pill health number.', 'Save my crew ID.', 'take note room number 8012', 'Remind me to bring my ID.',
  'set schedule dentist Friday at 3', 'remind me to buy bread', 'note the wine list is on page 2',
];
// WRITTEN for this measurement — statements that look like questions
export const TRICKY_SAVES = [
  'when I get home call Sam', 'when the ship docks buy a SIM card', 'if it rains bring the umbrella', 'after my shift call mom',
  'where Sam works is deck 3', 'how to make the sauce: butter then lemon', 'what Sam ordered was the steak', 'who to call for the AC is maintenance',
  'is it okay to swap shifts ask the head waiter', 'check the tire pressure', 'find a gift for mom', 'tell Sam the meeting moved to 4',
  'ask the purser when the crew bar is open', 'show the new guy the station', 'look up the train times to Rome tomorrow',
];
// Private-folder questions already in the tests
export const TEST_QUESTIONS = [
  "what's my SSS number?", 'what is my TIN', "what's my gmail password", 'password for netflix', 'netflix password?',
  "what's on tomorrow", 'when is my dentist', "what's my passport expiry", "what's in the tin",
  'What is my SRB number?', 'what is my S R B', 'What is my crew ID number?', 'What is my pill health ID?', 'What is my pug e-big number?',
  'Today', 'This week', 'This weekend',
];
// WRITTEN for this measurement — everyday questions, incl. ones with no question word
export const WRITTEN_QUESTIONS = [
  "what's on today", 'what do I have tomorrow', 'when is the boat drill', 'when is my next day off', 'where is the crew party',
  'where did I put my passport', 'who is my supervisor', 'who did I meet in Cozumel', 'how much is the Penfolds', 'how much did I pay for lunch',
  'what time is training', 'what time does my shift start', 'which day is formal night', 'what did I save about Sam', 'what is the wine list page',
  'is there anything on Friday', 'are there any drills this week', 'do I have anything tonight', 'did I pay the internet bill', 'any meetings tomorrow',
  'anything on Saturday', 'do I need to buy milk', 'is the dentist on Thursday', 'have I booked my flights', 'when do I sign on',
  'show my reminders', 'show me this week', 'list my notes', 'find Sam', 'find the price of Moet', 'tell me my schedule for Friday',
  'give me my reminders', 'search penfolds', 'check my schedule tomorrow', 'open my notes', 'read me my reminders',
  'tomorrow', 'tonight', 'next week', 'Friday', 'on Monday', 'this morning',
  'dinner with Sam?', 'Penfolds price?', 'flight home?', 'my reminders?', 'the gala dinner?',
  'what is the price of Opus One', "what's the booking reference", "what's the ship's call sign", "where's the crew gym", "who's the new sommelier",
  'how many tables in my station', "what's my cabin number", 'what do I need to buy', 'what are my reminders', 'when is Sam\'s birthday',
  'what is happening this weekend', 'whats on next week', 'when is payday', 'where do I sign on', 'what did Sam order',
];


/*
 * 2.0.0 build 98 (MemoAirem's own intent model) — MORE everyday sentences, WRITTEN, crew life and
 * home life, said the way people talk to a phone (no "?" — the listener often drops it). Kept apart
 * from the lists above so the rules' own measurement stays comparable.
 */
export const MORE_QUESTIONS = [
  'what do I have later', 'anything for me this afternoon', 'what is my plan for tomorrow', 'when is the next crew drill',
  'what time is lunch for the crew', 'where is my muster station', 'who is on the late shift with me', 'how much was the taxi in Nassau',
  'how much do I owe Sam', 'when did I last call mom', 'when is my contract ending', 'how many days until sign off',
  'what did the doctor say', 'where did I park', 'which deck is the crew gym on', 'what was the name of the new waiter',
  'do I have training this week', 'is there a drill tomorrow', 'any appointments on Monday', 'anything due this week',
  'have I paid the rent', 'did I send money home', 'did I call the agency', 'is my day off on Sunday',
  'when do we arrive in Cozumel', 'what port is tomorrow', 'when is the next port day', 'where are we on Thursday',
  'what is on my list', 'show me tomorrow', 'show me my notes about Sam', 'list my appointments for next week',
  'find the wine prices', 'search for the booking reference', 'look up my flight', 'check if I have anything on Friday',
  'tell me what I saved yesterday', 'read my notes', 'open my reminders for today', 'give me the schedule for next week',
  'my schedule tomorrow', 'my plans this weekend', 'notes about the gala', 'Sam birthday', 'flight details',
  'the price of Barolo', 'crew party time', 'dentist time', 'payday this month', 'tonight plans',
  'what is next on my schedule', 'what comes after the drill', 'is the crew bar open tonight', 'what was I supposed to buy',
  'what should I bring tomorrow', 'what do I need for sign on', 'what is the WiFi password for the crew', 'who has my charger',
  'remind me what I have today', 'can you tell me my schedule', 'could you check my reminders', 'please show my week',
  'what am I doing on Saturday', 'how is my week looking', 'how busy am I tomorrow', 'what is left for today',
  'which reminders are due', 'what is overdue', 'did I miss anything yesterday', 'what happened last Friday',
  'when was the inspection', 'how long is the shift tomorrow', 'what day is the captain dinner', 'who is coming to dinner',
  'where is the training room', 'how much is the crew card top up', 'what is the room number of the guest', 'which table is allergic to nuts',
  'do I work tomorrow', 'am I free on Sunday', 'am I working tonight', 'do we have a drill today',
  'whats happening tonight', 'whats my next appointment', 'wheres the meeting', 'whos my roommate',
  'time of the briefing', 'location of the party', 'cost of the tour', 'date of my flight',
];

export const MORE_SAVES = [
  'buy shampoo and soap', 'get new socks in Cozumel', 'call the bank on Monday morning', 'send the photos to mom',
  'pick up my uniform from the laundry at 3', 'renew my visa next month', 'pay Sam back 20 dollars', 'return the charger to Priya',
  'bring my ID to the crew office', 'clean the cabin before inspection', 'iron my shirt for formal night', 'buy a gift for my son',
  'text the agency about my contract', 'book the dentist for next week', 'order a cake for Sam on Friday', 'top up my load',
  'I need to call home tonight', 'I have to finish the inventory by Thursday', 'I must report to the doctor at 9', 'I want to buy a watch in St Maarten',
  'need to send the remittance', 'gotta fix my headphones', 'should check the bill', 'do not forget the umbrella',
  'remember the guest in 8012 likes still water', 'remember that Priya starts on Monday', 'note to self buy batteries', 'take note the meeting moved to 4',
  'schedule a call with the agency on Friday at 10', 'set a reminder for my medicine at 8 pm', 'reminder pay the credit card on the 15th', 'add lunch with the team tomorrow',
  'crew drill on Wednesday at 2 pm', 'formal night on Saturday', 'port day in Nassau on Tuesday', 'sign off on December 20',
  'my day off is on Sunday', 'training in the crew theater at 3', 'birthday party in the crew bar at 11 pm', 'coffee with Sam after the shift',
  'video call with the family at 10 pm', 'haircut appointment on Thursday at 1', 'gym with Priya every morning at 7', 'meeting at the pursers desk tomorrow',
  'the new maitre d is Marco', 'my locker is number 212', 'the crew office opens at 9', 'the tour costs 80 dollars',
  'Sam owes me 30 dollars', 'the guest at table 5 is vegan', 'the bar closes at 2 am', 'the shuttle leaves at 8 from the pier',
  'I paid 15 dollars for the taxi', 'lunch was 12 dollars', 'the Barolo is 95 dollars a bottle', 'the special tonight is lamb',
  'Marco likes his steak medium rare', 'my roommate is from India', 'the clinic is on deck 1', 'my muster station is B',
  'the wifi package is 10 dollars a day', 'the captain dinner is on Friday', 'the inspection is next Monday', 'my flight is at 6 am',
  'Priya birthday is on May 4', 'the code for the storeroom is the same as last week', 'the printer is fixed', 'mom called about the house',
  'I left my jacket in the mess', 'the package arrived', 'great show tonight in the theater', 'the food at the market was cheap',
  'tomorrow buy bread', 'tonight call mom', 'on Friday pay the rent', 'next week renew the visa',
  'when you see Sam tell him about the swap', 'if the shop is open buy stamps', 'after lunch clean the station', 'before sign off return the keys',
  'ask Marco about the menu', 'tell Priya the briefing is at 4', 'check the stock in the bar', 'look for a cheaper flight',
  'find a charger in town', 'show Sam the new station', 'list the wines for the gala', 'search for a good hotel in Rome',
];
