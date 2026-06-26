/**
 * 验证码 / OTP 提取器。
 *
 * 设计原则：
 *  - 高召回：覆盖中英文、4-8 位、纯数字 / 含字母的常见验证码。
 *  - 低误报：用「上下文关键词」(验证码/verification/code/OTP)作为先决条件，
 *    避免把无关数字(订单号、金额、日期)当成验证码。
 *  - 多规则按优先级排序，首个命中即返回。
 */

interface OtpHit {
  code: string;
  rule: string;
}

/** 上下文关键词：邮件正文/主题里出现这些词，才认为是验证码邮件 */
const CONTEXT_KEYWORDS = [
  "验证码",
  "校验码",
  "验证",
  "动态码",
  "验证代码",
  "verification",
  "verify",
  "code",
  "otp",
  "one-time",
  "passcode",
  "passcode",
  "confirm",
  "activation",
  "pin",
  "captcha",
];

/** 规则集：从精确到宽松排序，按序尝试 */
const RULES: { rule: string; pattern: RegExp }[] = [
  // 1. 6 位数字（最常见）
  { rule: "6位数字", pattern: /\b(\d{6})\b/ },
  // 2. 4 位数字
  { rule: "4位数字", pattern: /\b(\d{4})\b/ },
  // 3. 8 位数字
  { rule: "8位数字", pattern: /\b(\d{8})\b/ },
  // 4. 5 位数字
  { rule: "5位数字", pattern: /\b(\d{5})\b/ },
  // 5. 7 位数字
  { rule: "7位数字", pattern: /\b(\d{7})\b/ },
  // 6. 带分隔的 3-3 或 3-4（如 123 456）
  { rule: "分组数字", pattern: /\b(\d{3}[-\s]\d{3,4})\b/ },
  // 7. 字母+数字混合（4-8 位，排除纯 URL/邮箱）
  {
    rule: "含字母的验证码",
    pattern: /\b((?=[A-Za-z0-9]{4,8})(?=.*\d)[A-Za-z0-9]{4,8})\b/,
  },
];

/** 判断主题+预览是否「看起来像验证码邮件」（用于列表高亮） */
export function looksLikeOtpMail(subject: string, snippet: string): boolean {
  const text = `${subject} ${snippet}`.toLowerCase();
  return CONTEXT_KEYWORDS.some((k) => text.includes(k));
}

/**
 * 从主题+正文提取验证码。
 * 必须先命中上下文关键词，否则返回 null（防误报）。
 */
export function extractOtp(subject: string, body: string): OtpHit | null {
  const combined = `${subject}\n${body}`;
  const lower = combined.toLowerCase();

  // 先决条件：必须出现上下文关键词
  if (!CONTEXT_KEYWORDS.some((k) => lower.includes(k))) {
    return null;
  }

  // 策略：在「关键词附近」优先找，提高准确性
  for (const rule of RULES) {
    // 尝试：关键词后 N 字符内的数字
    for (const kw of CONTEXT_KEYWORDS) {
      const kwLower = kw.toLowerCase();
      let idx = lower.indexOf(kwLower);
      while (idx !== -1) {
        const window = combined.slice(idx, idx + 80);
        const m = rule.pattern.exec(window);
        if (m && isPlausibleCode(m[1])) {
          return { code: cleanCode(m[1]), rule: rule.rule };
        }
        idx = lower.indexOf(kwLower, idx + 1);
      }
    }
  }

  // 兜底：全文匹配（关键词已命中，但码不在关键词附近）
  for (const rule of RULES) {
    const m = rule.pattern.exec(combined);
    if (m && isPlausibleCode(m[1])) {
      return { code: cleanCode(m[1]), rule: rule.rule };
    }
  }

  return null;
}

/** 过滤明显不是验证码的数字（年份、价格等） */
function isPlausibleCode(code: string): boolean {
  const digits = code.replace(/\D/g, "");
  // 排除年份 19xx/20xx
  if (/^(19|20)\d{2}$/.test(digits)) return false;
  // 排除全相同（如 000000）
  if (/^(\d)\1{3,}$/.test(digits)) return false;
  // 排除连续递增/递减（如 123456）
  if (isSequential(digits)) return false;
  return true;
}

function isSequential(s: string): boolean {
  if (s.length < 4) return false;
  let asc = true;
  let desc = true;
  for (let i = 1; i < s.length; i++) {
    const d = Number(s[i]) - Number(s[i - 1]);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

function cleanCode(code: string): string {
  // 去掉分组码里的空格/连字符，保持输出整洁
  return code.replace(/[-\s]/g, "");
}
