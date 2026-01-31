/**
 * tools.ts - 도구 실행 함수들
 *
 * Gemini Function Calling에서 호출하는 도구 로직을 정의합니다.
 * 각 함수는 args(JSON object)를 받아서 string 결과를 반환합니다.
 *
 * [이어서 작업할 때 참고]
 * - 새 도구 추가 시: 1) 여기에 execute 함수 추가  2) chat.ts의 functionDeclarations에 추가  3) chat.ts의 executeTool에 추가
 * - GEMINI_API_KEY는 env에서 가져옵니다
 */

// =============================================
// 날씨 조회 (Open-Meteo API - 무료, 키 불필요)
// =============================================
export async function executeWeather(args: { city: string }): Promise<string> {
  const { city } = args;
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
  );
  const geoData: any = await geoRes.json();
  if (!geoData.results?.length) return `도시를 찾을 수 없습니다: ${city}`;

  const { latitude, longitude, name, country } = geoData.results[0];
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
  );
  const weatherData: any = await weatherRes.json();
  const current = weatherData.current;
  const weatherCodes: Record<number, string> = {
    0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림",
    45: "안개", 48: "서리 안개", 51: "약한 이슬비", 53: "이슬비", 55: "강한 이슬비",
    61: "약한 비", 63: "비", 65: "강한 비",
    71: "약한 눈", 73: "눈", 75: "강한 눈",
    80: "약한 소나기", 81: "소나기", 82: "강한 소나기",
    95: "뇌우", 96: "우박 뇌우", 99: "강한 우박 뇌우",
  };
  const condition = weatherCodes[current.weather_code] ?? `코드 ${current.weather_code}`;
  return `📍 ${name}, ${country}\n🌡️ 기온: ${current.temperature_2m}°C\n💧 습도: ${current.relative_humidity_2m}%\n💨 풍속: ${current.wind_speed_10m} km/h\n🌤️ 상태: ${condition}`;
}

// =============================================
// 환율 조회 (open.er-api.com - 무료, 키 불필요)
// =============================================
export async function executeExchangeRate(args: {
  from: string;
  to: string;
  amount?: number;
}): Promise<string> {
  const { from, to, amount } = args;
  const res = await fetch(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`);
  const data: any = await res.json();
  if (data.result !== "success") return `환율 조회 실패: ${data["error-type"] || "알 수 없는 오류"}`;

  const rate = data.rates?.[to.toUpperCase()];
  if (!rate) return `통화를 찾을 수 없습니다: ${to}`;

  const qty = amount ?? 1;
  const converted = (qty * rate).toFixed(2);
  return `💱 ${from.toUpperCase()} → ${to.toUpperCase()}\n환율: 1 ${from.toUpperCase()} = ${rate} ${to.toUpperCase()}\n${qty} ${from.toUpperCase()} = ${converted} ${to.toUpperCase()}`;
}

// =============================================
// 번역 (Gemini API)
// =============================================
export async function executeTranslate(
  args: { text: string; target_language: string; source_language?: string },
  apiKey: string
): Promise<string> {
  const { text, target_language, source_language } = args;
  const fromLang = source_language ? `${source_language}에서 ` : "";
  const prompt = `다음 텍스트를 ${fromLang}${target_language}로 번역해주세요. 번역된 텍스트만 반환하세요:\n\n${text}`;
  return await callGemini(prompt, apiKey);
}

// =============================================
// 요약 (Gemini API)
// =============================================
export async function executeSummarize(
  args: { text: string; style?: string; language?: string },
  apiKey: string
): Promise<string> {
  const { text, style, language } = args;
  const styleMap: Record<string, string> = {
    brief: "2-3문장으로 요약해주세요",
    detailed: "핵심 포인트를 모두 포함하여 상세히 요약해주세요",
    bullet_points: "글머리 기호로 요약해주세요",
  };
  const styleInstruction = styleMap[style ?? "brief"];
  const langInstruction = language ? ` ${language}로 답변해주세요.` : "";
  const prompt = `${styleInstruction}.${langInstruction}\n\n${text}`;
  return await callGemini(prompt, apiKey);
}

// =============================================
// 웹 검색 (DuckDuckGo Instant Answer - 무료, 키 불필요)
// =============================================
export async function executeWebSearch(args: {
  query: string;
  num_results?: number;
}): Promise<string> {
  const { query, num_results } = args;
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
  );
  const data: any = await res.json();
  const results: string[] = [];
  if (data.Abstract) {
    results.push(`**${data.Heading}**\n${data.Abstract}\n출처: ${data.AbstractURL}`);
  }
  const limit = Math.min(num_results ?? 5, 10);
  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics.slice(0, limit)) {
      if (topic.Text) results.push(`- ${topic.Text}\n  ${topic.FirstURL || ""}`);
    }
  }
  return results.length > 0 ? results.join("\n\n") : `"${query}"에 대한 검색 결과가 없습니다.`;
}

// =============================================
// URL 가져오기
// =============================================
export async function executeFetchUrl(args: {
  url: string;
  max_length?: number;
}): Promise<string> {
  const { url, max_length } = args;
  const res = await fetch(url, { headers: { "User-Agent": "MCP-Server/2.0" } });
  if (!res.ok) return `HTTP ${res.status}: ${res.statusText}`;

  const contentType = res.headers.get("content-type") || "";
  let text: string;
  if (contentType.includes("application/json")) {
    const json = await res.json();
    text = JSON.stringify(json, null, 2);
  } else {
    text = await res.text();
    if (contentType.includes("text/html")) {
      text = text
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  const limit = max_length ?? 5000;
  return text.length > limit ? text.substring(0, limit) + "\n... (잘림)" : text;
}

// =============================================
// 계산기
// =============================================
export async function executeCalculate(args: {
  operation: string;
  a: number;
  b: number;
}): Promise<string> {
  const { operation, a, b } = args;
  let result: number;
  switch (operation) {
    case "add": result = a + b; break;
    case "subtract": result = a - b; break;
    case "multiply": result = a * b; break;
    case "divide":
      if (b === 0) return "오류: 0으로 나눌 수 없습니다";
      result = a / b; break;
    default: return `알 수 없는 연산: ${operation}`;
  }
  return `${a} ${operation} ${b} = ${result}`;
}

// =============================================
// 날짜/시간
// =============================================
export async function executeDatetime(args: {
  timezone?: string;
}): Promise<string> {
  const tz = args.timezone ?? "Asia/Seoul";
  const now = new Date();
  const formatted = now.toLocaleString("ko-KR", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "long",
  });
  return `🕐 타임존: ${tz}\n📅 ${formatted}`;
}

// =============================================
// Gemini API 호출 헬퍼 (번역, 요약 등에서 사용)
// =============================================
async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const data: any = await res.json();
  if (!res.ok) return `Gemini API 오류: ${JSON.stringify(data)}`;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "응답 없음";
}
