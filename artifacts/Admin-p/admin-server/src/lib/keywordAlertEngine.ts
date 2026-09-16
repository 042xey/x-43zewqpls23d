export interface AlertRule {
  keywords: string[];
  mode: "exact" | "phrase" | "contains" | "regex";
  caseSensitive: boolean;
  senderPattern: string;
  recipientPattern: string;
  subjectPattern: string;
  bodyPattern: string;
  attachmentPattern: string;
}

export interface DryRunInput {
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  attachment: string;
}

export interface DryRunResult {
  matched: boolean;
  explanation: string;
  field: string;
}

export function evaluateDryRun(rule: AlertRule, sample: DryRunInput): DryRunResult {
  const fields: { key: string; name: string; value: string; pattern: string }[] = [
    { key: "sender", name: "Sender", value: sample.sender, pattern: rule.senderPattern },
    { key: "recipient", name: "Recipient", value: sample.recipient, pattern: rule.recipientPattern },
    { key: "subject", name: "Subject", value: sample.subject, pattern: rule.subjectPattern },
    { key: "body", name: "Body", value: sample.body, pattern: rule.bodyPattern },
    { key: "attachment", name: "Attachment", value: sample.attachment, pattern: rule.attachmentPattern },
  ];

  const patternErrors: string[] = [];
  for (const field of fields) {
    if (!field.pattern) continue;
    try {
      const regex = new RegExp(field.pattern, rule.caseSensitive ? "" : "i");
      if (regex.test(field.value)) {
        return {
          matched: true,
          explanation: `Field pattern "${field.pattern}" matched "${field.name}" value.`,
          field: field.name,
        };
      }
    } catch {
      patternErrors.push(`${field.name}: invalid regex pattern`);
    }
  }

  if (rule.keywords.length > 0) {
    const haystack = [sample.sender, sample.recipient, sample.subject, sample.body, sample.attachment].join(" ");
    const normalizedHaystack = rule.caseSensitive ? haystack : haystack.toLowerCase();

    for (const keyword of rule.keywords) {
      const candidate = rule.caseSensitive ? keyword : keyword.toLowerCase();

      let matched = false;
      switch (rule.mode) {
        case "exact":
          matched = keyword.split(" ").every((word) => {
            const w = rule.caseSensitive ? word : word.toLowerCase();
            return new RegExp(`\\b${escapeRegex(w)}\\b`, rule.caseSensitive ? "" : "i").test(normalizedHaystack);
          });
          break;
        case "phrase":
          matched = normalizedHaystack.includes(candidate);
          break;
        case "contains":
          matched = normalizedHaystack.includes(candidate);
          break;
        case "regex":
          try {
            matched = new RegExp(candidate, rule.caseSensitive ? "" : "i").test(normalizedHaystack);
          } catch {
            continue;
          }
          break;
      }

      if (matched) {
        const field = fields.find((f) => f.value.toLowerCase().includes(candidate))?.name ?? "Body";
        return {
          matched: true,
          explanation: `Keyword "${keyword}" matched in the sample ${field.toLowerCase()} field.`,
          field,
        };
      }
    }
  }

  if (patternErrors.length > 0) {
    return { matched: false, explanation: `Pattern errors: ${patternErrors.join("; ")}.`, field: "—" };
  }

  return { matched: false, explanation: `No ${rule.mode} rule matched the sample fields.`, field: "—" };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}