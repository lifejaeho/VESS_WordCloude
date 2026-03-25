import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is missing in process.env");
}

export interface KeywordResult {
  word: string;
  score: number;
  type: "single" | "phrase";
  sentence: string;
  description: string;
  x: number;
  y: number;
  size: number;
}

export async function extractKeywords(text: string): Promise<KeywordResult[]> {
  if (!text.trim()) return [];

  // Truncate input to keep it manageable
  const truncatedText = text.length > 4000 ? text.substring(0, 4000) + "..." : text;

  const systemInstruction = `
Extract 50-80 problem-related keywords from Korean text.
Include a very wide spectrum: 10-15 core major problems (score 0.8-1.0) and 40-65 minor, peripheral, or very specific concerns (score 0.05-0.4).

SCORING LOGIC:
The 'score' (0-1) should be determined by:
1. Frequency: How often the concept or its specific examples appear in the text.
2. Severity/Impact: How critical the problem is to the user's life or society.
A high score means the keyword is both frequently mentioned AND represents a significant pain point.

CRITICAL: Include a mix of both abstract concepts (e.g., '정보격차', '디지털 소외') AND concrete, specific examples mentioned in the text (e.g., '키오스크', '스마트폰 조작', '배달 앱'). Do NOT omit specific objects or actions in favor of higher-level categories; we want BOTH to be present for a rich brainstorming experience.

For each keyword, provide:
1. 'word': The keyword itself.
2. 'score': Importance score (0-1) based on Frequency + Severity.
3. 'type': "single" or "phrase".
4. 'sentence': A detailed summary of the problem related to this keyword. Phrased as "~이런 문제점이 있다고 생각함" or "~해서 떠올리게 되었고". 
   - Length: 180-270 characters (Very Detailed).
   - STRICT: Use ONLY the provided text. Do NOT use external knowledge, do NOT search the web, and do NOT hallucinate details not present in the input.
5. 'description': A brief explanation of the keyword (under 40 chars).

Output MUST be valid JSON.
`;

  const prompt = `
Text: "${truncatedText}"
Extract an exhaustive set of keywords (50-80 items) in JSON format. 
Include every single problem, concern, or detail mentioned or implied in the text.
For the 'sentence' field, summarize the specific problem or insight related to the keyword using phrases like "~이런 문제점이 있다고 생각함" or "~해서 떠올리게 되었고".
`;

  const fetchWithTimeout = async (promise: Promise<any>, ms: number) => {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("분석 시간이 초과되었습니다. (Timeout)")), ms)
    );
    return Promise.race([promise, timeout]);
  };

  try {
    console.log("Extracting keywords... Length:", truncatedText.length);
    
    const apiCall = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keywords: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  type: { type: Type.STRING, enum: ["single", "phrase"] },
                  sentence: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["word", "score", "type", "sentence", "description"],
              },
            },
          },
          required: ["keywords"],
        },
      },
    });

    const response = await fetchWithTimeout(apiCall, 180000) as any;

    if (!response || !response.text) {
      console.error("API Response missing text:", response);
      throw new Error("API 응답에서 텍스트를 찾을 수 없습니다.");
    }

    let textResponse = response.text.trim();
    console.log("Raw API Response:", textResponse);

    // Robust JSON repair
    const repairJson = (json: string) => {
      let repaired = json.trim();
      
      // Close open strings
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) repaired += '"';

      // Close brackets
      const stack: string[] = [];
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
        }
      }
      while (stack.length > 0) repaired += stack.pop();

      // Remove trailing commas
      repaired = repaired.replace(/,\s*([}\]])/g, '$1');
      return repaired;
    };

    if (textResponse.startsWith("{") && !textResponse.endsWith("}")) {
      textResponse = repairJson(textResponse);
      console.log("Repaired JSON:", textResponse);
    }

    let keywords: any[] = [];
    try {
      const parsed = JSON.parse(textResponse);
      keywords = parsed.keywords || (Array.isArray(parsed) ? parsed : []);
    } catch (parseError) {
      console.warn("JSON parse failed, attempting regex extraction fallback...");
      // Regex to find objects that look like { "word": "...", ... }
      // We look for objects that have at least a "word" property
      const objectRegex = /\{[^{}]*"word"\s*:\s*"[^"]+"[^{}]*\}/g;
      const matches = textResponse.match(objectRegex);
      
      if (matches && matches.length > 0) {
        console.log(`Found ${matches.length} potential keyword objects via regex.`);
        for (const match of matches) {
          try {
            // Try to parse the individual object. 
            // We might need to close it if it's slightly truncated but has the core data
            let objText = match.trim();
            if (!objText.endsWith('}')) objText += '}';
            
            const parsedObj = JSON.parse(objText);
            if (parsedObj.word) {
              keywords.push(parsedObj);
            }
          } catch (e) {
            // Skip objects that are too broken to parse individually
          }
        }
      }
      
      if (keywords.length === 0) {
        console.error("Regex extraction also failed. Raw text:", textResponse);
        throw new Error("데이터 형식이 올바르지 않아 분석에 실패했습니다.");
      }
    }
    
    if (!keywords || keywords.length === 0) {
      throw new Error("추출된 키워드가 없습니다.");
    }

    return keywords.map((k) => ({
      ...k,
      x: Math.random() * 70 + 15,
      y: Math.random() * 70 + 15,
      size: 1 + (Number(k.score) || 0.5) * 4,
    }));
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
}
