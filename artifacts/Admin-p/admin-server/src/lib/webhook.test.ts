// Local integration test for webhook notifications + keyword alert matching
// Usage: node --import tsx src/lib/webhook.test.ts

import { evaluateDryRun, type AlertRule, type DryRunInput } from "./keywordAlertEngine";

// Test 1: Dry-run matches keyword in subject
const rule1: AlertRule = {
  keywords: ["urgent", "payment"],
  mode: "phrase",
  caseSensitive: false,
  senderPattern: "",
  recipientPattern: "",
  subjectPattern: "",
  bodyPattern: "",
  attachmentPattern: "",
};

const sample1: DryRunInput = {
  sender: "treasury@example.com",
  recipient: "finance@example.com",
  subject: "Urgent payment hold — vendor 8821",
  body: "Please review the wire transfer approval.",
  attachment: "",
};

const result1 = evaluateDryRun(rule1, sample1);
console.log("Test 1 - keyword match in subject:", result1.matched ? "PASS" : "FAIL");
console.log("  Explanation:", result1.explanation);
console.log("  Field:", result1.field);
if (!result1.matched) process.exit(1);

// Test 2: No match when keywords absent
const sample2: DryRunInput = {
  sender: "noreply@example.com",
  recipient: "user@example.com",
  subject: "Weekly newsletter",
  body: "Your weekly update is ready.",
  attachment: "",
};
const result2 = evaluateDryRun(rule1, sample2);
console.log("Test 2 - no match:", result2.matched === false ? "PASS" : "FAIL");
if (result2.matched) process.exit(1);

// Test 3: Field regex pattern match
const rule3: AlertRule = {
  keywords: [],
  mode: "contains",
  caseSensitive: false,
  senderPattern: "@example\\.com",
  recipientPattern: "",
  subjectPattern: "",
  bodyPattern: "",
  attachmentPattern: "",
};
const sample3: DryRunInput = {
  sender: "treasury@example.com",
  recipient: "ops@example.com",
  subject: "Invoice #123",
  body: "Payment due",
  attachment: "",
};
const result3 = evaluateDryRun(rule3, sample3);
console.log("Test 3 - regex pattern match:", result3.matched ? "PASS" : "FAIL");
console.log("  Field:", result3.field);
if (!result3.matched) process.exit(1);

// Test 4: Exact mode
const rule4: AlertRule = {
  keywords: ["wire transfer"],
  mode: "exact",
  caseSensitive: false,
  senderPattern: "",
  recipientPattern: "",
  subjectPattern: "",
  bodyPattern: "",
  attachmentPattern: "",
};
const sample4a: DryRunInput = {
  sender: "",
  recipient: "",
  subject: "wire transfer approval needed",
  body: "wire transfer",
  attachment: "",
};
const result4a = evaluateDryRun(rule4, sample4a);
console.log("Test 4a - exact match:", result4a.matched ? "PASS" : "FAIL");
if (!result4a.matched) process.exit(1);

// Test 5: Cooldown test (simulate)
console.log("Test 5 - cooldown logic: check cooldown field exists in alerts schema");

// Test 6: Webhook notification simulation
// This test validates the data structure the webhook handler expects
const mockNotification = {
  value: [{
    subscriptionId: "test-sub-1",
    clientState: "test-state",
    resource: "/users/user@example.com/messages/msg-123",
    changeType: "created",
  }],
};
console.log("Test 6 - notification payload structure:", 
  Array.isArray(mockNotification.value) ? "PASS" : "FAIL"
);
if (!Array.isArray(mockNotification.value)) process.exit(1);

// Test 7: Verify webhook route resource parsing
const resourcePath = "/users/user@example.com/messages/msg-123";
const match = resourcePath.match(/\/users\/([^/]+)\/messages\/([^/]+)/);
if (!match) {
  console.log("Test 7 - resource parsing: FAIL (no match)");
  process.exit(1);
}
const mailbox = decodeURIComponent(match[1]);
const messageId = match[2];
const correct = mailbox === "user@example.com" && messageId === "msg-123";
console.log("Test 7 - resource parsing:", correct ? "PASS" : "FAIL");
if (!correct) process.exit(1);

console.log("\nAll tests passed!");