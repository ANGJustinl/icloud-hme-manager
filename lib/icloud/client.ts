import "server-only";

import {
  CLIENT_BUILD,
  CLIENT_ID,
  HME_PATHS,
  setupUrl,
  type IcloudDomain,
} from "./constants";
import type {
  HmeEmail,
  HmeGenerateResult,
  HmeListResult,
  HmeResponse,
  ValidateResponse,
} from "./types";

/**
 * 从原油猴脚本移植的 iCloud HME 客户端。
 *
 * 关键差异（脚本 vs 本服务端）：
 *  - 脚本：注入在 icloud.com 同源上下文，浏览器自动带 Cookie，靠 GM_xmlhttpRequest 绕 CORS。
 *  - 本模块：Node 进程，无 CORS 限制，但需显式传入从用户处收集的 Cookie 字符串。
 *
 * 保留脚本踩坑后的健壮性细节：
 *  - Content-Type 必须是 text/plain（iCloud 的反爬策略，写 application/json 会被拒）。
 *  - Origin 设为 https://www.icloud.com（或 .com.cn）。
 *  - getApiBase 的多候选 key 查找逻辑（maildomainws → premiummailsettings → 模糊匹配 mail/hme/hide）。
 */

export class IcloudError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "IcloudError";
    this.status = status;
  }
}

function baseDomain(domain: IcloudDomain): IcloudDomain {
  return domain;
}

/** 鉴权失败的 HTTP 状态（Cookie 失效）。 */
function isAuthFailure(status?: number): boolean {
  return status === 401 || status === 403 || status === 421;
}

/** 可重试的瞬时错误：网络失败（无 status）/ 429 限流 / 5xx 服务端错误。 */
function isRetriable(e: unknown): boolean {
  if (!(e instanceof IcloudError)) return false;
  if (e.status === undefined) return true; // 网络层失败
  if (e.status === 429) return true;
  if (e.status >= 500 && e.status < 600) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 对瞬时错误做指数退避重试（网络抖动 / 429 / 5xx）。
 * 鉴权失效（401/403/421）不在此重试——交由 callApi 的"清缓存重发现"逻辑处理。
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 400;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1 || !isRetriable(e)) throw e;
      // 指数退避 + 抖动：400ms, 800ms, ...
      await sleep(baseDelay * 2 ** i + Math.random() * 200);
    }
  }
  throw lastErr;
}

/** 底层请求：等价于脚本的 makeRequest，返回已解析的 JSON（或纯文本）。 */
async function makeRequest<T = unknown>(
  url: string,
  method: "GET" | "POST" | "DELETE" | "PATCH",
  opts: {
    cookie: string;
    domain: IcloudDomain;
    payload?: unknown;
  },
): Promise<T> {
  const body = opts.payload !== undefined ? JSON.stringify(opts.payload) : undefined;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        // ⚠️ 必须 text/plain，否则 iCloud 会拒绝（脚本里就是这么写的）
        "Content-Type": "text/plain",
        Origin: `https://www.${baseDomain(opts.domain)}`,
        Cookie: opts.cookie,
        Accept: "*/*",
      },
      body,
      // 不跟随重定向，iCloud 校验失败时会重定向到登录页，我们要捕获而非吞掉
      redirect: "manual",
      cache: "no-store",
    });
  } catch (e) {
    throw new IcloudError(
      `网络请求失败：${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (res.status === 0 || (res.status >= 300 && res.status < 400)) {
    // 重定向通常意味着未登录
    throw new IcloudError("凭证已失效或被重定向，请重新粘贴 Cookie", res.status);
  }

  if (res.status === 421 || res.status === 401 || res.status === 403) {
    throw new IcloudError("凭证已失效，请刷新 icloud.com 重新登录并更新 Cookie", res.status);
  }

  if (res.status < 200 || res.status >= 300) {
    throw new IcloudError(`HTTP ${res.status}`, res.status);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * 发现 HME API 的 base URL。
 *
 * 等价于脚本的 getApiBase，但增加：
 *  - 可选的 DB 缓存注入（由调用方管理缓存，本函数保持纯函数特性便于测试）。
 *  - 凭证失效时抛 IcloudError，调用方可据此清空缓存重试。
 */
export async function discoverApiBase(
  cookie: string,
  domain: IcloudDomain,
): Promise<string> {
  const data = await makeRequest<ValidateResponse>(setupUrl(domain), "POST", {
    cookie,
    domain,
  });
  if (!data || !data.webservices) {
    throw new IcloudError("无法读取 webservices，凭证可能已失效");
  }

  const ws = data.webservices;
  // 1) 精确候选 key
  const candidates = ["maildomainws", "premiummailsettings"];
  // 2) 模糊候选关键词
  const fuzzy = ["mail", "hme", "hide"];

  let foundUrl: string | undefined;
  for (const key of candidates) {
    const svc = ws[key];
    if (svc?.url) {
      foundUrl = svc.url;
      break;
    }
  }
  if (!foundUrl) {
    for (const key in ws) {
      const svc = ws[key];
      const lk = key.toLowerCase();
      if (fuzzy.some((p) => lk.includes(p)) && svc?.url) {
        foundUrl = svc.url;
        break;
      }
    }
  }

  if (!foundUrl) {
    throw new IcloudError("该账号未开通隐藏邮件功能或无 iCloud+ 订阅");
  }
  return foundUrl;
}

/** 在 base 后面拼上 clientBuildNumber / clientId 查询参数。 */
function withClientParams(base: string, path: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${path}${sep}clientBuildNumber=${CLIENT_BUILD}&clientId=${CLIENT_ID}`;
}

/**
 * 完整 iCloud HME 客户端：自动处理 API base 发现 + 缓存。
 *
 * 缓存由调用方（API 路由层）通过 getApiBase/setApiBase 回调注入——
 * 这样客户端逻辑与 DB 解耦，且凭证失效时能清缓存重试一次。
 */
export async function createHmeClient(deps: {
  cookie: string;
  domain: IcloudDomain;
  /** 返回缓存的 api base，没有则返回 null */
  getCachedApiBase: () => string | null;
  /** 写入新的 api base 缓存 */
  setCachedApiBase: (url: string) => void;
  /** 清空 api base 缓存（凭证失效时调用） */
  clearCachedApiBase: () => void;
  /** 任意调用成功后回调（用于把 Cookie 状态标记为 ok） */
  onAuthSuccess?: () => void;
  /** 凭证确认失效后回调（用于把 Cookie 状态标记为 invalid） */
  onAuthInvalid?: (message: string) => void;
}) {
  async function resolveBase(): Promise<string> {
    const cached = deps.getCachedApiBase();
    if (cached) return cached;
    const base = await discoverApiBase(deps.cookie, deps.domain);
    deps.setCachedApiBase(base);
    return base;
  }

  async function callApi<T = unknown>(
    path: string,
    method: "GET" | "POST" | "DELETE" | "PATCH",
    payload?: unknown,
  ): Promise<T> {
    let base: string;
    try {
      base = await withRetry(() => resolveBase());
    } catch (e) {
      if (e instanceof IcloudError) {
        if (isAuthFailure(e.status)) deps.onAuthInvalid?.(e.message);
        throw e;
      }
      throw new IcloudError("发现 API base 失败");
    }

    try {
      const res = await withRetry(() =>
        makeRequest<T>(withClientParams(base, path), method, {
          cookie: deps.cookie,
          domain: deps.domain,
          payload,
        }),
      );
      deps.onAuthSuccess?.();
      return res;
    } catch (e) {
      // 凭证失效类错误：清缓存并重新发现 base 后重试一次（base 可能已变更）
      if (e instanceof IcloudError && isAuthFailure(e.status)) {
        deps.clearCachedApiBase();
        try {
          base = await discoverApiBase(deps.cookie, deps.domain);
          deps.setCachedApiBase(base);
          const res = await withRetry(() =>
            makeRequest<T>(withClientParams(base, path), method, {
              cookie: deps.cookie,
              domain: deps.domain,
              payload,
            }),
          );
          deps.onAuthSuccess?.();
          return res;
        } catch (e2) {
          // 重试后仍失败：确认凭证失效，回写状态
          if (e2 instanceof IcloudError && isAuthFailure(e2.status)) {
            deps.onAuthInvalid?.(e2.message);
          }
          throw e2;
        }
      }
      throw e;
    }
  }

  return {
    /** 列出所有别名（已在服务端按创建时间倒序） */
    async list(): Promise<HmeEmail[]> {
      const res = await callApi<HmeResponse<HmeListResult>>(HME_PATHS.list, "GET");
      if (!res?.result?.hmeEmails) {
        throw new IcloudError("无法读取别名列表");
      }
      return sortByEmails(res.result.hmeEmails);
    },

    /** 申请一个新邮箱地址（仅生成，未保留） */
    async generate(): Promise<string> {
      const res = await callApi<HmeResponse<HmeGenerateResult>>(HME_PATHS.generate, "POST", {
        lang: "zh-cn",
      });
      if (!res?.success || !res.result?.hme) {
        throw new IcloudError(res?.error ? String(res.error) : "分配新邮箱失败");
      }
      return res.result.hme;
    },

    /** 保留（正式注册）一个已生成的邮箱 */
    async reserve(hme: string, label: string, note: string): Promise<void> {
      const res = await callApi<HmeResponse>(HME_PATHS.reserve, "POST", { hme, label, note });
      if (!res?.success) {
        throw new IcloudError(res?.error ? String(res.error) : "保留邮箱失败");
      }
    },

    /** 更新标签/备注 */
    async update(anonymousId: string, label: string, note: string): Promise<void> {
      const res = await callApi<HmeResponse>(HME_PATHS.update, "POST", {
        anonymousId,
        label,
        note,
      });
      if (!res?.success) {
        throw new IcloudError(res?.error ? String(res.error) : "更新别名失败");
      }
    },

    /** 永久删除别名 */
    async remove(anonymousId: string): Promise<void> {
      const res = await callApi<HmeResponse>(HME_PATHS.delete, "POST", { anonymousId });
      if (!res?.success) {
        throw new IcloudError(res?.error ? String(res.error) : "删除别名失败");
      }
    },

    /** 恢复转发 */
    async reactivate(anonymousId: string): Promise<void> {
      const res = await callApi<HmeResponse>(HME_PATHS.reactivate, "POST", { anonymousId });
      if (!res?.success) {
        throw new IcloudError(res?.error ? String(res.error) : "恢复转发失败");
      }
    },

    /** 停用转发 */
    async deactivate(anonymousId: string): Promise<void> {
      const res = await callApi<HmeResponse>(HME_PATHS.deactivate, "POST", { anonymousId });
      if (!res?.success) {
        throw new IcloudError(res?.error ? String(res.error) : "停用转发失败");
      }
    },
  };
}

/** 按创建时间倒序（最新在前）。对齐脚本行为。 */
function sortByEmails(emails: HmeEmail[]): HmeEmail[] {
  return [...emails].sort((a, b) => {
    const ta = a.createTimestamp ?? a.createdAt ?? 0;
    const tb = b.createTimestamp ?? b.createdAt ?? 0;
    return tb - ta;
  });
}
