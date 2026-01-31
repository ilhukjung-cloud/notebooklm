/**
 * chat.ts - Gemini Function Calling 오케스트레이터
 *
 * 사용자 메시지를 받아 Gemini에게 전달하고, Function Calling을 통해
 * 적절한 도구를 자동 선택/실행한 후 최종 답변을 반환합니다.
 *
 * [이어서 작업할 때 참고]
 * - 새 도구 추가: functionDeclarations 배열에 추가 + executeTool 함수에 case 추가
 * - Gemini 모델 변경: GEMINI_MODEL 상수 수정
 * - 최대 도구 호출 횟수: MAX_TOOL_CALLS 상수 수정
 */

import {
  executeWeather,
  executeExchangeRate,
  executeTranslate,
  executeSummarize,
  executeWebSearch,
  executeFetchUrl,
  executeCalculate,
  executeDatetime,
} from "./tools";

const GEMINI_MODEL = "gemini-3-pro-preview";
const MAX_TOOL_CALLS = 5;

// =============================================
// Gemini에 전달할 도구 선언 (Function Calling)
// =============================================
const functionDeclarations = [
  {
    name: "weather",
    description: "도시의 현재 날씨를 조회합니다. 기온, 습도, 풍속, 날씨 상태를 반환합니다.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "도시 이름 (예: Seoul, Tokyo, New York)" },
      },
      required: ["city"],
    },
  },
  {
    name: "exchange_rate",
    description: "두 통화 간의 실시간 환율을 조회하고 금액을 변환합니다.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "원래 통화 코드 (예: USD, KRW, EUR, JPY)" },
        to: { type: "string", description: "변환할 통화 코드" },
        amount: { type: "number", description: "변환할 금액 (기본값: 1)" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "translate",
    description: "텍스트를 다른 언어로 번역합니다.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "번역할 텍스트" },
        target_language: { type: "string", description: "번역 대상 언어 (예: Korean, English, Japanese)" },
        source_language: { type: "string", description: "원본 언어 (지정하지 않으면 자동 감지)" },
      },
      required: ["text", "target_language"],
    },
  },
  {
    name: "summarize",
    description: "긴 텍스트를 요약합니다. 간략, 상세, 글머리기호 스타일을 선택할 수 있습니다.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "요약할 텍스트" },
        style: { type: "string", enum: ["brief", "detailed", "bullet_points"], description: "요약 스타일" },
        language: { type: "string", description: "출력 언어" },
      },
      required: ["text"],
    },
  },
  {
    name: "web_search",
    description: "웹에서 정보를 검색합니다.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색어" },
        num_results: { type: "number", description: "결과 수 (기본값: 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_url",
    description: "URL에서 웹 페이지 내용을 가져옵니다.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "가져올 URL" },
        max_length: { type: "number", description: "최대 반환 글자수 (기본값: 5000)" },
      },
      required: ["url"],
    },
  },
  {
    name: "calculate",
    description: "사칙연산을 수행합니다.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["add", "subtract", "multiply", "divide"], description: "연산 종류" },
        a: { type: "number", description: "첫 번째 숫자" },
        b: { type: "number", description: "두 번째 숫자" },
      },
      required: ["operation", "a", "b"],
    },
  },
  {
    name: "datetime",
    description: "특정 타임존의 현재 날짜와 시간을 조회합니다.",
    parameters: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "타임존 (예: Asia/Seoul, America/New_York). 기본값: Asia/Seoul" },
      },
    },
  },
];

// =============================================
// 도구 실행 라우터
// =============================================
async function executeTool(
  name: string,
  args: any,
  apiKey: string
): Promise<string> {
  try {
    switch (name) {
      case "weather": return await executeWeather(args);
      case "exchange_rate": return await executeExchangeRate(args);
      case "translate": return await executeTranslate(args, apiKey);
      case "summarize": return await executeSummarize(args, apiKey);
      case "web_search": return await executeWebSearch(args);
      case "fetch_url": return await executeFetchUrl(args);
      case "calculate": return await executeCalculate(args);
      case "datetime": return await executeDatetime(args);
      default: return `알 수 없는 도구: ${name}`;
    }
  } catch (err: any) {
    return `도구 실행 오류 (${name}): ${err.message}`;
  }
}

// =============================================
// 대화 히스토리 타입
// =============================================
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ChatResponse {
  reply: string;
  tools_used: string[];
}

// =============================================
// 메인 오케스트레이터: handleChat
// =============================================
export async function handleChat(
  message: string,
  history: ChatMessage[],
  apiKey: string
): Promise<ChatResponse> {
  const toolsUsed: string[] = [];

  // 대화 히스토리를 Gemini 형식으로 변환
  const contents: any[] = [];

  // 시스템 프롬프트를 첫 user 메시지에 포함
  const systemPrompt =
    "당신은 친절하고 유능한 AI 어시스턴트입니다. 한국어로 답변하세요. " +
    "사용자의 질문에 따라 적절한 도구(함수)를 사용하여 실시간 정보를 제공하세요. " +
    "도구를 사용할 필요 없는 일반 대화에는 도구를 호출하지 마세요.";

  // 이전 대화 히스토리 추가
  for (const msg of history) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.text }],
    });
  }

  // 현재 메시지 추가 (첫 메시지면 시스템 프롬프트 포함)
  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: `${systemPrompt}\n\n사용자 질문: ${message}` }],
    });
  } else {
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });
  }

  // Function Calling 루프
  for (let i = 0; i < MAX_TOOL_CALLS; i++) {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          tools: [{ functionDeclarations }],
        }),
      }
    );

    const geminiData: any = await geminiRes.json();

    if (!geminiRes.ok) {
      return {
        reply: `Gemini API 오류가 발생했습니다: ${geminiData.error?.message || JSON.stringify(geminiData)}`,
        tools_used: toolsUsed,
      };
    }

    const candidate = geminiData.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      return { reply: "Gemini에서 응답을 받지 못했습니다.", tools_used: toolsUsed };
    }

    const parts = candidate.content.parts;

    // Function Call 확인
    const functionCallPart = parts.find((p: any) => p.functionCall);

    if (functionCallPart) {
      // 도구 호출
      const { name, args } = functionCallPart.functionCall;
      toolsUsed.push(name);

      const toolResult = await executeTool(name, args, apiKey);

      // Gemini 3 Pro: thoughtSignature 보존 필수
      // 모델이 반환한 parts를 그대로 사용해야 함
      contents.push({
        role: "model",
        parts: parts, // 원본 parts를 그대로 보존 (thoughtSignature 포함)
      });
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name, response: { result: toolResult } } }],
      });

      // 루프를 계속해서 Gemini가 최종 텍스트 응답을 생성하도록 함
      continue;
    }

    // 텍스트 응답 - 최종 답변
    const textPart = parts.find((p: any) => p.text);
    if (textPart) {
      return { reply: textPart.text, tools_used: toolsUsed };
    }

    return { reply: "응답을 처리할 수 없습니다.", tools_used: toolsUsed };
  }

  return {
    reply: "도구 호출 횟수 제한에 도달했습니다. 질문을 다시 시도해주세요.",
    tools_used: toolsUsed,
  };
}
