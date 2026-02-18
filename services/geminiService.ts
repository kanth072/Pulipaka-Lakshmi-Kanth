import { GoogleGenAI, Type } from "@google/genai";
import { ProductListing } from "../types";

const parseDataUrl = (dataUrl: string) => {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid image format");
  return { mimeType: matches[1], data: matches[2] };
};

/**
 * Handles retries for transient errors like 503 (Overloaded) or 429 (Rate Limit).
 * Includes jitter and exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = String(err.message || err);
      if (msg.includes("503") || msg.includes("429") || msg.includes("overloaded") || msg.includes("limit") || msg.includes("RESOURCE_EXHAUSTED")) {
        const backoff = Math.pow(2, i) * 1500 + Math.random() * 1000;
        console.warn(`Transient error (${msg.slice(0, 80)}). Retrying in ${Math.round(backoff)}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function getAI(): GoogleGenAI {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("Gemini API Key not configured. Please add your API_KEY in the environment variables.");
  return new GoogleGenAI({ apiKey });
}

export const generateProfessionalListing = async (
  imagesBase64: string[],
  rawDescription: string
): Promise<ProductListing> => {
  const ai = getAI();

  const imageParts = imagesBase64.map(img => {
    const { mimeType, data } = parseDataUrl(img);
    return { inlineData: { mimeType, data } };
  });

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          ...imageParts,
          {
            text: `System: Act as an expert e-commerce catalog optimizer with years of experience creating marketplace-ready product listings.
            
Input Notes from seller: "${rawDescription || 'No additional notes provided'}".

Task: Analyze the provided product photos carefully and create a professional, conversion-optimized marketplace listing.

Requirements:
- Title: Compelling, keyword-rich product title (60-120 characters)
- Description: Persuasive 2-3 sentence product description highlighting unique value
- Key Features: 4-6 specific, benefit-driven bullet points
- Specifications: 4-8 technical specifications with accurate key/value pairs

Return valid JSON matching the schema exactly.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            keyFeatures: { type: Type.ARRAY, items: { type: Type.STRING } },
            specifications: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ["key", "value"],
              },
            },
          },
          required: ["title", "description", "keyFeatures", "specifications"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("AI returned an empty response. Please try again.");
    return JSON.parse(text.trim()) as ProductListing;
  });
};

export const generateImageVariant = async (
  originalImageBase64: string,
  variantType: 'Studio' | 'Lifestyle' | 'Contextual',
  productTitle: string
): Promise<string> => {
  const ai = getAI();
  const { mimeType, data } = parseDataUrl(originalImageBase64);

  const prompts = {
    'Studio': `Generate a high-end professional studio photograph of this product: "${productTitle}". Place it on a pure seamless white background with commercial-grade three-point lighting. The image should be 8K quality with razor sharp focus, suitable for an e-commerce product page hero image.`,
    'Lifestyle': `Generate a premium lifestyle catalog photograph of this product: "${productTitle}". Show it being used naturally in a modern, aesthetically pleasing home interior with cinematic natural window lighting and warm tones. The scene should feel aspirational and magazine-quality.`,
    'Contextual': `Generate a close-up macro detail shot of this product: "${productTitle}" that showcases the texture, material quality, and craftsmanship. Use a beautiful bokeh background with professional studio lighting. The image should highlight premium quality and build trust.`
  };

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: {
        parts: [
          { inlineData: { mimeType, data } },
          { text: prompts[variantType] },
        ],
      },
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      }
    });

    let imageUrl = '';
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageUrl) throw new Error(`Image generation failed for ${variantType} variant. The model did not return an image.`);
    return imageUrl;
  });
};
