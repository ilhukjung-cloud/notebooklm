/**
 * index.ts - 메인 라우터
 *
 * [이어서 작업할 때 참고]
 * - 이 파일은 Cloudflare Worker의 진입점입니다
 * - GET / → 채팅 UI (src/ui.ts)
 * - POST /api/chat → Gemini 오케스트레이터 (src/chat.ts)
 * - /mcp, /sse → 기존 MCP 프로토콜 (Claude Desktop, ChatGPT 등에서 사용)
 * - 새 페이지 추가: fetch 핸들러에 라우트 추가
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleChat } from "./chat";
import { getHtml } from "./ui";

export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "my-remote-mcp",
    version: "2.0.0",
  });

  async init() {
    // =============================================
    // 🔤 기본 도구
    // =============================================

    this.server.tool("hello", "Say hello", {}, async () => ({
      content: [{ type: "text", text: "Hello from Cloudflare Workers!" }],
    }));

    this.server.tool(
      "add",
      "Add two numbers",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }],
      })
    );

    this.server.tool(
      "calculate",
      "Perform basic arithmetic operations",
      {
        operation: z.enum(["add", "subtract", "multiply", "divide"]),
        a: z.number(),
        b: z.number(),
      },
      async ({ operation, a, b }) => {
        let result: number;
        switch (operation) {
          case "add": result = a + b; break;
          case "subtract": result = a - b; break;
          case "multiply": result = a * b; break;
          case "divide":
            if (b === 0) return { content: [{ type: "text", text: "Error: Division by zero" }] };
            result = a / b; break;
        }
        return { content: [{ type: "text", text: String(result) }] };
      }
    );

    // =============================================
    // 🤖 AI 도구
    // =============================================

    this.server.tool(
      "ask_gemini",
      "Ask Google Gemini AI a question and get a response",
      { prompt: z.string().describe("The question or prompt to send to Gemini") },
      async ({ prompt }) => {
        const apiKey = (this.env as Env).GEMINI_API_KEY;
        if (!apiKey) {
          return { content: [{ type: "text", text: "Error: GEMINI_API_KEY is not configured" }] };
        }
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            }
          );
          const data: any = await res.json();
          if (!res.ok) return { content: [{ type: "text", text: `Gemini API error: ${JSON.stringify(data)}` }] };
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response from Gemini";
          return { content: [{ type: "text", text }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error calling Gemini: ${err.message}` }] };
        }
      }
    );

    // =============================================
    // 🌐 웹 스킬
    // =============================================

    this.server.tool(
      "fetch_url",
      "Fetch content from a URL and return the text",
      {
        url: z.string().url().describe("The URL to fetch"),
        max_length: z.number().optional().describe("Max characters to return (default 5000)"),
      },
      async ({ url, max_length }) => {
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": "MCP-Server/2.0" },
          });
          if (!res.ok) {
            return { content: [{ type: "text", text: `HTTP ${res.status}: ${res.statusText}` }] };
          }
          const contentType = res.headers.get("content-type") || "";
          let text: string;
          if (contentType.includes("application/json")) {
            const json = await res.json();
            text = JSON.stringify(json, null, 2);
          } else {
            text = await res.text();
            // HTML에서 간단히 태그 제거
            if (contentType.includes("text/html")) {
              text = text.replace(/<script[\s\S]*?<\/script>/gi, "")
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            }
          }
          const limit = max_length ?? 5000;
          if (text.length > limit) {
            text = text.substring(0, limit) + "\n... (truncated)";
          }
          return { content: [{ type: "text", text }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Fetch error: ${err.message}` }] };
        }
      }
    );

    this.server.tool(
      "web_search",
      "Search the web using Google and return results",
      {
        query: z.string().describe("Search query"),
        num_results: z.number().optional().describe("Number of results (default 5, max 10)"),
      },
      async ({ query, num_results }) => {
        // Google Custom Search API 또는 대안으로 DuckDuckGo Instant Answer API 사용
        try {
          const res = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
          );
          const data: any = await res.json();
          const results: string[] = [];
          if (data.Abstract) {
            results.push(`**${data.Heading}**\n${data.Abstract}\nSource: ${data.AbstractURL}`);
          }
          const limit = Math.min(num_results ?? 5, 10);
          if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics.slice(0, limit)) {
              if (topic.Text) {
                results.push(`- ${topic.Text}\n  ${topic.FirstURL || ""}`);
              }
            }
          }
          if (results.length === 0) {
            return { content: [{ type: "text", text: `No results found for: ${query}` }] };
          }
          return { content: [{ type: "text", text: results.join("\n\n") }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Search error: ${err.message}` }] };
        }
      }
    );

    // =============================================
    // 📝 텍스트 처리 스킬
    // =============================================

    this.server.tool(
      "translate",
      "Translate text using Gemini AI",
      {
        text: z.string().describe("Text to translate"),
        target_language: z.string().describe("Target language (e.g., Korean, English, Japanese)"),
        source_language: z.string().optional().describe("Source language (auto-detect if not specified)"),
      },
      async ({ text, target_language, source_language }) => {
        const apiKey = (this.env as Env).GEMINI_API_KEY;
        if (!apiKey) return { content: [{ type: "text", text: "Error: GEMINI_API_KEY not configured" }] };
        const fromLang = source_language ? `from ${source_language} ` : "";
        const prompt = `Translate the following text ${fromLang}to ${target_language}. Return ONLY the translated text, no explanations:\n\n${text}`;
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            }
          );
          const data: any = await res.json();
          const result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Translation failed";
          return { content: [{ type: "text", text: result }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Translation error: ${err.message}` }] };
        }
      }
    );

    this.server.tool(
      "summarize",
      "Summarize text using Gemini AI",
      {
        text: z.string().describe("Text to summarize"),
        style: z.enum(["brief", "detailed", "bullet_points"]).optional().describe("Summary style (default: brief)"),
        language: z.string().optional().describe("Output language (default: same as input)"),
      },
      async ({ text, style, language }) => {
        const apiKey = (this.env as Env).GEMINI_API_KEY;
        if (!apiKey) return { content: [{ type: "text", text: "Error: GEMINI_API_KEY not configured" }] };
        const styleMap: Record<string, string> = {
          brief: "Summarize in 2-3 sentences",
          detailed: "Provide a detailed summary covering all key points",
          bullet_points: "Summarize as bullet points",
        };
        const styleInstruction = styleMap[style ?? "brief"];
        const langInstruction = language ? ` Answer in ${language}.` : "";
        const prompt = `${styleInstruction}.${langInstruction}\n\n${text}`;
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            }
          );
          const data: any = await res.json();
          const result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Summarization failed";
          return { content: [{ type: "text", text: result }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Summarize error: ${err.message}` }] };
        }
      }
    );

    // =============================================
    // 🛠️ 유틸리티 스킬
    // =============================================

    this.server.tool(
      "weather",
      "Get current weather for a city",
      {
        city: z.string().describe("City name (e.g., Seoul, Tokyo, New York)"),
      },
      async ({ city }) => {
        try {
          // Open-Meteo Geocoding + Weather API (무료, 키 불필요)
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
          );
          const geoData: any = await geoRes.json();
          if (!geoData.results?.length) {
            return { content: [{ type: "text", text: `City not found: ${city}` }] };
          }
          const { latitude, longitude, name, country } = geoData.results[0];
          const weatherRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
          );
          const weatherData: any = await weatherRes.json();
          const current = weatherData.current;
          const weatherCodes: Record<number, string> = {
            0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
            45: "Foggy", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
            55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
            71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
            80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
            95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
          };
          const condition = weatherCodes[current.weather_code] ?? `Code ${current.weather_code}`;
          const result = [
            `📍 ${name}, ${country}`,
            `🌡️ Temperature: ${current.temperature_2m}°C`,
            `💧 Humidity: ${current.relative_humidity_2m}%`,
            `💨 Wind: ${current.wind_speed_10m} km/h`,
            `🌤️ Condition: ${condition}`,
          ].join("\n");
          return { content: [{ type: "text", text: result }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Weather error: ${err.message}` }] };
        }
      }
    );

    this.server.tool(
      "exchange_rate",
      "Get current exchange rate between two currencies",
      {
        from: z.string().describe("Source currency code (e.g., USD, KRW, EUR, JPY)"),
        to: z.string().describe("Target currency code (e.g., USD, KRW, EUR, JPY)"),
        amount: z.number().optional().describe("Amount to convert (default 1)"),
      },
      async ({ from, to, amount }) => {
        try {
          const res = await fetch(
            `https://open.er-api.com/v6/latest/${from.toUpperCase()}`
          );
          const data: any = await res.json();
          if (data.result !== "success") {
            return { content: [{ type: "text", text: `Exchange rate error: ${data["error-type"] || "Unknown error"}` }] };
          }
          const rate = data.rates?.[to.toUpperCase()];
          if (!rate) {
            return { content: [{ type: "text", text: `Currency not found: ${to}` }] };
          }
          const qty = amount ?? 1;
          const converted = (qty * rate).toFixed(2);
          const result = [
            `💱 ${from.toUpperCase()} → ${to.toUpperCase()}`,
            `Rate: 1 ${from.toUpperCase()} = ${rate} ${to.toUpperCase()}`,
            `${qty} ${from.toUpperCase()} = ${converted} ${to.toUpperCase()}`,
            `Updated: ${data.time_last_update_utc}`,
          ].join("\n");
          return { content: [{ type: "text", text: result }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Exchange rate error: ${err.message}` }] };
        }
      }
    );

    this.server.tool(
      "datetime",
      "Get current date and time for a timezone",
      {
        timezone: z.string().optional().describe("Timezone (e.g., Asia/Seoul, America/New_York). Default: UTC"),
      },
      async ({ timezone }) => {
        try {
          const tz = timezone ?? "UTC";
          const now = new Date();
          const formatted = now.toLocaleString("en-US", {
            timeZone: tz,
            dateStyle: "full",
            timeStyle: "long",
          });
          const isoString = now.toISOString();
          const result = [
            `🕐 Timezone: ${tz}`,
            `📅 ${formatted}`,
            `ISO: ${isoString}`,
          ].join("\n");
          return { content: [{ type: "text", text: result }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Datetime error: ${err.message}` }] };
        }
      }
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // 채팅 UI
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(getHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 채팅 API (Gemini 오케스트레이터)
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body: any = await request.json();
        const { message, history } = body;

        if (!message || typeof message !== "string") {
          return Response.json({ error: "message is required" }, { status: 400 });
        }

        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
        }

        const result = await handleChat(message, history || [], apiKey);
        return Response.json(result);
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // 기존 MCP 엔드포인트 (하위 호환)
    if (url.pathname === "/mcp" || url.pathname === "/mcp/message") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return MyMCP.serve("/sse").fetch(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
