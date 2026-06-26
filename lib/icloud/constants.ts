// iCloud HME API 常量
// 这些值从原油猴脚本中提取，是 iCloud 私有 Web Services 的客户端标识。
// 脚本作者通过抓包验证过这组值可用；若未来 Apple 更新导致失效，更新这里即可。

export const CLIENT_BUILD = "2610Hotfix23";

// 客户端 ID 是一个固定的 UUID，iCloud 用它来识别会话。
export const CLIENT_ID = "37bd9669-50c3-4d52-af42-1d240d3ac4f3";

// iCloud 域名后缀（中国大陆区 vs 国际区）
export const ICLOUD_DOMAINS = ["icloud.com", "icloud.com.cn"] as const;
export type IcloudDomain = (typeof ICLOUD_DOMAINS)[number];

// setup.icloud.com 用于校验登录态并发现各 Web Service 的 API base URL
export function setupUrl(domain: IcloudDomain): string {
  return `https://setup.${domain}/setup/ws/1/validate?clientBuildNumber=${CLIENT_BUILD}&clientId=${CLIENT_ID}`;
}

// HME 相关 API 路径（相对 API base）
export const HME_PATHS = {
  list: "/v2/hme/list",
  generate: "/v1/hme/generate",
  reserve: "/v1/hme/reserve",
  update: "/v1/hme/update",
  delete: "/v1/hme/delete",
  reactivate: "/v1/hme/reactivate",
  deactivate: "/v1/hme/deactivate",
} as const;
