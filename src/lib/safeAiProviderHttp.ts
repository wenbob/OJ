import { promises as dns } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

export type SafeAiProviderHttpErrorKind =
  | "invalid-url"
  | "unsafe-target"
  | "timeout"
  | "response-too-large"
  | "network";

export class SafeAiProviderHttpError extends Error {
  constructor(
    public readonly kind: SafeAiProviderHttpErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SafeAiProviderHttpError";
  }
}

export type SafeAiProviderTarget = {
  address: string;
  family: 4 | 6;
};

type ResolveOptions = {
  allowDevelopmentNetworkProxy?: boolean;
  allowLocalDevelopment?: boolean;
  lookup?: typeof dns.lookup;
};

type RequestOptions = ResolveOptions & {
  body?: string;
  headers?: Record<string, string>;
  maxResponseBytes: number;
  method: "GET" | "POST";
  timeoutMs: number;
  url: string;
};

const blockedIpv4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

const blockedIpv6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:db8::", 32],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

const developmentNetworkProxyRange = new BlockList();
developmentNetworkProxyRange.addSubnet("198.18.0.0", 15, "ipv4");

function normalizedHostname(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isLocalDevelopmentHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isLoopbackAddress(address: string) {
  if (isIP(address) === 4) {
    return address.startsWith("127.");
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "0:0:0:0:0:0:0:1";
}

export function isPublicAiProviderAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    return !blockedIpv4.check(address, "ipv4");
  }
  if (family !== 6) return false;

  const normalized = address.toLowerCase();
  if (normalized.includes("%") || normalized.startsWith("::ffff:")) {
    return false;
  }
  if (blockedIpv6.check(normalized, "ipv6")) {
    return false;
  }

  const firstHextet = normalized.split(":")[0];
  const firstValue = Number.parseInt(firstHextet, 16);
  return Number.isFinite(firstValue) && firstValue >= 0x2000 && firstValue <= 0x3fff;
}

export function normalizeAiProviderBaseUrl(
  value: string,
  {
    allowLocalDevelopment = process.env.NODE_ENV !== "production",
  }: { allowLocalDevelopment?: boolean } = {},
) {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new SafeAiProviderHttpError("invalid-url", "AI Base URL 格式不合法");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new SafeAiProviderHttpError(
      "invalid-url",
      "AI Base URL 不能包含凭据、查询参数或片段",
    );
  }

  const hostname = normalizedHostname(url);
  const localDevelopmentTarget =
    allowLocalDevelopment && isLocalDevelopmentHostname(hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localDevelopmentTarget)) {
    throw new SafeAiProviderHttpError(
      "invalid-url",
      "AI Base URL 必须使用公共 HTTPS 地址",
    );
  }
  if (!hostname) {
    throw new SafeAiProviderHttpError("invalid-url", "AI Base URL 缺少主机名");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

export async function resolveSafeAiProviderTarget(
  value: string,
  {
    allowDevelopmentNetworkProxy = false,
    allowLocalDevelopment = process.env.NODE_ENV !== "production",
    lookup = dns.lookup,
  }: ResolveOptions = {},
): Promise<{ normalizedUrl: string; target: SafeAiProviderTarget }> {
  const normalizedUrl = normalizeAiProviderBaseUrl(value, {
    allowLocalDevelopment,
  });
  const url = new URL(normalizedUrl);
  const hostname = normalizedHostname(url);
  const localDevelopmentTarget =
    allowLocalDevelopment && isLocalDevelopmentHostname(hostname);

  const literalFamily = isIP(hostname);
  const addresses =
    literalFamily === 4 || literalFamily === 6
      ? [{ address: hostname, family: literalFamily }]
      : await lookup(hostname, { all: true, verbatim: true }).catch(() => {
          throw new SafeAiProviderHttpError(
            "network",
            "AI 服务地址解析失败",
          );
        });

  if (!addresses.length) {
    throw new SafeAiProviderHttpError("network", "AI 服务地址解析失败");
  }

  const normalizedAddresses = addresses
    .filter(
      (item): item is { address: string; family: 4 | 6 } =>
        item.family === 4 || item.family === 6,
    )
    .map((item) => ({ address: item.address, family: item.family }));

  const allAllowed = localDevelopmentTarget
    ? normalizedAddresses.every((item) => isLoopbackAddress(item.address))
    : normalizedAddresses.every(
        (item) =>
          isPublicAiProviderAddress(item.address) ||
          (allowDevelopmentNetworkProxy &&
            process.env.NODE_ENV !== "production" &&
            item.family === 4 &&
            developmentNetworkProxyRange.check(item.address, "ipv4")),
      );
  if (!normalizedAddresses.length || !allAllowed) {
    throw new SafeAiProviderHttpError(
      "unsafe-target",
      "AI 服务地址不能指向本机、内网或保留网络",
    );
  }

  const target =
    normalizedAddresses.find((item) => item.family === 4) ??
    normalizedAddresses.find((item) => item.family === 6);
  if (!target) {
    throw new SafeAiProviderHttpError("network", "AI 服务地址解析失败");
  }

  return { normalizedUrl, target };
}

function createPinnedLookup(target: SafeAiProviderTarget): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [target]);
      return;
    }
    callback(null, target.address, target.family);
  };
}

function safeRequestError(error: unknown) {
  if (error instanceof SafeAiProviderHttpError) return error;
  if (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      /timed out|timeout|aborted/i.test(error.message))
  ) {
    return new SafeAiProviderHttpError("timeout", "AI 服务请求超时");
  }
  return new SafeAiProviderHttpError("network", "AI 服务网络请求失败");
}

export async function requestSafeAiProviderHttp({
  allowDevelopmentNetworkProxy = false,
  allowLocalDevelopment = process.env.NODE_ENV !== "production",
  body,
  headers = {},
  lookup,
  maxResponseBytes,
  method,
  timeoutMs,
  url,
}: RequestOptions) {
  const { normalizedUrl, target } = await resolveSafeAiProviderTarget(url, {
    allowDevelopmentNetworkProxy,
    allowLocalDevelopment,
    lookup,
  });
  const endpoint = new URL(normalizedUrl);
  const hostname = normalizedHostname(endpoint);
  const transport = endpoint.protocol === "https:" ? https : http;
  const signal = AbortSignal.timeout(timeoutMs);

  return new Promise<{
    body: string;
    headers: http.IncomingHttpHeaders;
    status: number;
  }>((resolve, reject) => {
    const request = transport.request(
      endpoint,
      {
        headers,
        lookup: createPinnedLookup(target),
        method,
        servername: isIP(hostname) ? undefined : hostname,
        signal,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let receivedBytes = 0;

        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;
          if (receivedBytes > maxResponseBytes) {
            response.destroy(
              new SafeAiProviderHttpError(
                "response-too-large",
                "AI 服务响应内容过大",
              ),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            status: response.statusCode ?? 502,
          });
        });
        response.on("error", (error) => reject(safeRequestError(error)));
      },
    );

    request.on("error", (error) => reject(safeRequestError(error)));
    if (body) request.write(body);
    request.end();
  });
}
