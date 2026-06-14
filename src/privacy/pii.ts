export type PiiEntity =
  | "email"
  | "phone"
  | "creditCard"
  | "ssn"
  | "ipAddress"
  | "apiKey";

export interface PiiRedactionConfig {
  enabled?: boolean;
  entities?: PiiEntity[];
  replacement?: string;
  patterns?: Array<{
    name?: string;
    pattern: string | RegExp;
    replacement?: string;
  }>;
}

export type PiiRedactionOption = boolean | PiiRedactionConfig;

type Rule = {
  entity: string;
  pattern: RegExp;
  replacement: string;
  validate?: (match: string) => boolean;
};

const DEFAULT_ENTITIES: PiiEntity[] = [
  "email",
  "phone",
  "creditCard",
  "ssn",
  "ipAddress",
  "apiKey",
];

const DEFAULT_REPLACEMENT = "[REDACTED]";

// Strings longer than this are skipped by redaction to bound ReDoS exposure.
const MAX_REDACTABLE_LENGTH = 100_000;

export class PiiRedactor {
  private readonly rules: Rule[];

  constructor(config: PiiRedactionConfig = {}) {
    const replacement = config.replacement ?? DEFAULT_REPLACEMENT;
    const entities = config.entities ?? DEFAULT_ENTITIES;

    this.rules = [
      ...entities.map((entity) => buildRule(entity, replacement)),
      ...(config.patterns ?? []).map((rule) => ({
        entity: rule.name ?? "custom",
        pattern: toGlobalRegExp(rule.pattern),
        replacement: rule.replacement ?? replacement,
      })),
    ];
  }

  redact<T>(value: T): T {
    return this.redactValue(value, new WeakSet<object>()) as T;
  }

  private redactValue(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === "string") return this.redactString(value);
    if (Array.isArray(value)) return value.map((item) => this.redactValue(item, seen));
    if (value === null || typeof value !== "object") return value;

    if (seen.has(value)) return value;
    seen.add(value);

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        this.redactValue(nested, seen),
      ]),
    );
  }

  private redactString(value: string): string {
    // Bound worst-case regex execution. Very long strings are the trigger for
    // catastrophic backtracking (ReDoS) in user-supplied patterns, and are far
    // more likely to be large blobs (base64, embeddings) than PII anyway.
    if (value.length > MAX_REDACTABLE_LENGTH) return value;

    let redacted = value;
    for (const rule of this.rules) {
      redacted = redacted.replace(rule.pattern, (match) => {
        if (rule.validate && !rule.validate(match)) return match;
        return rule.replacement.replace("{entity}", rule.entity);
      });
    }
    return redacted;
  }
}

export function createPiiRedactor(
  config: PiiRedactionOption | undefined,
): PiiRedactor | undefined {
  if (config === undefined || config === false) return undefined;
  if (config === true) return new PiiRedactor();
  if (config.enabled === false) return undefined;
  return new PiiRedactor(config);
}

function buildRule(entity: PiiEntity, replacement: string): Rule {
  if (entity === "email") {
    return {
      entity,
      pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      replacement,
    };
  }
  if (entity === "phone") {
    return {
      entity,
      pattern: /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g,
      replacement,
    };
  }
  if (entity === "creditCard") {
    return {
      entity,
      pattern: /\b(?:\d[ -]*?){13,19}\b/g,
      replacement,
      validate: isLikelyCreditCard,
    };
  }
  if (entity === "ssn") {
    return {
      entity,
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement,
    };
  }
  if (entity === "ipAddress") {
    return {
      entity,
      pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      replacement,
      validate: isIpv4,
    };
  }
  return {
    entity,
    // Covers: generic prefixed keys (sk_/pk_/rk_/lnv_), OpenAI project keys
    // (sk-proj-...), Anthropic keys (sk-ant-...), AWS access key ids (AKIA...),
    // GitHub tokens (ghp_/gho_/ghu_/ghs_/ghr_), and Bearer tokens.
    pattern:
      /\b(?:sk|pk|rk|lnv)_[A-Za-z0-9_-]{16,}\b|\bsk-(?:proj|ant|or)-[A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bBearer\s+[A-Za-z0-9._\-+/=]{12,}\b/g,
    replacement,
  };
}

function toGlobalRegExp(pattern: string | RegExp): RegExp {
  if (typeof pattern === "string") return new RegExp(pattern, "g");
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}

function isLikelyCreditCard(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isIpv4(value: string): boolean {
  return value.split(".").every((part) => {
    const octet = Number(part);
    return Number.isInteger(octet) && octet >= 0 && octet <= 255;
  });
}
