/** 邮件列表项（精简） */
export interface MailSummary {
  uid: number;
  /** 内部日期（服务器接收时间），毫秒时间戳 */
  date: number;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  /** 是否已读 */
  seen: boolean;
  /** 预览文本（正文前 ~120 字） */
  snippet: string;
  /** 是否包含疑似验证码（前端高亮用） */
  hasOtp: boolean;
}

/** 邮件详情（含完整正文） */
export interface MailDetail extends MailSummary {
  /** 纯文本正文 */
  text: string;
  /** HTML 正文（可能为空） */
  html: string | null;
}

/** 验证码提取结果 */
export interface OtpExtract {
  /** 提取到的验证码 */
  code: string;
  /** 命中的来源邮件 uid */
  uid: number;
  /** 来源邮件主题 */
  subject: string;
  /** 命中规则的可读名称（如 "6位数字"、"4位数字"、"含字母的验证码"） */
  rule: string;
}

/** 验证码扫描统计，用于判断失败原因 */
export interface OtpExtractStats {
  /** 本次从 IMAP 中选取扫描的最新邮件数量 */
  searched: number;
  /** 严格匹配到目标隐藏别名的邮件数量 */
  matchedAlias: number;
  /** 因未匹配目标隐藏别名而跳过的邮件数量 */
  skippedByAlias: number;
  /** 已完成 MIME 解析的邮件数量 */
  parsed: number;
}

export interface OtpExtractResult {
  otp: OtpExtract | null;
  latest: MailSummary[];
  stats: OtpExtractStats;
}
