// iCloud HME API 类型定义

/** 单个隐藏邮件别名（HME） */
export interface HmeEmail {
  /** 别名邮箱地址，如 abc@icloud.com */
  hme: string;
  /** 用户自定义标签 */
  label: string;
  /** 用户自定义备注 */
  note?: string;
  /** 是否激活（转发中） */
  isActive: boolean;
  /** 别名唯一 ID（启停/删除用） */
  anonymousId: string;
  /** 创建时间戳（毫秒） */
  createTimestamp?: number;
  /** 部分接口返回的等价字段 */
  createdAt?: number;
  /** 该别名已收到的邮件数 */
  numberOfForwardedEmails?: number;
  /** 该别名被使用的网站域名记录 */
  domainQuotas?: unknown;
}

/** setup/validate 返回的 webservices map */
export interface WebServices {
  [key: string]: { url?: string; status?: string; [k: string]: unknown };
}

/** setup/validate 接口响应 */
export interface ValidateResponse {
  webservices?: WebServices;
  [k: string]: unknown;
}

/** HME 通用响应包装 */
export interface HmeResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string | number;
  [k: string]: unknown;
}

/** list 接口的 result */
export interface HmeListResult {
  hmeEmails: HmeEmail[];
  [k: string]: unknown;
}

/** generate 接口的 result */
export interface HmeGenerateResult {
  hme: string;
  [k: string]: unknown;
}
