/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/generate" && request.method === "POST") {
      return generateProductImage(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

async function generateProductImage(request: Request, env: Env): Promise<Response> {
  const serverApiKey = env.OPENAI_API_KEY?.trim() || "";
  const apiKey = serverApiKey || request.headers.get("x-openai-key")?.trim() || "";
  if (!apiKey) {
    return Response.json({ error: "图片服务尚未连接。请展开左侧“图片服务连接”，填写 API Key，或在服务端完成长期配置。" }, { status: 503 });
  }

  try {
    const requestedBaseUrl = serverApiKey
      ? env.OPENAI_BASE_URL || "https://api.openai.com/v1"
      : request.headers.get("x-openai-base-url") || "https://api.openai.com/v1";
    const endpoint = buildImageEditsEndpoint(requestedBaseUrl);
    const incoming = await request.formData();
    const prompt = String(incoming.get("prompt") || "");
    const quality = String(incoming.get("quality") || "low");
    const size = String(incoming.get("size") || "960x768");
    const mode = String(incoming.get("mode") || "preview");
    const images = incoming.getAll("images").filter((value): value is File => value instanceof File);

    if (!prompt || images.length === 0) {
      return Response.json({ error: "请上传至少一张产品参考图。" }, { status: 400 });
    }

    const upstream = new FormData();
    upstream.append("model", "gpt-image-2");
    upstream.append("prompt", prompt);
    upstream.append("size", size);
    upstream.append("quality", quality);
    upstream.append("output_format", "jpeg");
    upstream.append("output_compression", mode === "preview" ? "78" : "95");
    images.slice(0, 9).forEach((image, index) => upstream.append("image[]", image, image.name || `reference-${index + 1}.jpg`));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    const result = await response.json() as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
    if (!response.ok || !result.data?.[0]?.b64_json) {
      return Response.json({ error: result.error?.message || "图片生成服务暂时不可用。" }, { status: response.status || 502 });
    }
    return Response.json({ dataUrl: `data:image/jpeg;base64,${result.data[0].b64_json}` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法处理本次图片请求。" }, { status: 500 });
  }
}

function buildImageEditsEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl.trim());
  if (url.protocol !== "https:") throw new Error("Base URL 必须使用 HTTPS。");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Base URL 不能包含账号、密码、查询参数或锚点。");
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}/images/edits`;
  return url.toString();
}
