import { GoogleGenAI, Type } from "@google/genai";
import { ProductListing } from "../types";

const parseDataUrl = (dataUrl: string) => {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid image format");
  return { mimeType: matches[1], data: matches[2] };
};

/**
 * Handles retries for transient errors like 503 (Overloaded) or 429 (Rate Limit).
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = err.message || "";
      if (msg.includes("503") || msg.includes("429") || msg.includes("overloaded")) {
        const backoff = Math.pow(2, i) * 1000 + Math.random() * 500;
        console.warn(`Transient error. Retrying in ${Math.round(backoff)}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export const generateProfessionalListing = async (
  imagesBase64: string[],
  rawDescription: string
): Promise<ProductListing> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const imageParts = imagesBase64.map(img => {
    const { mimeType, data } = parseDataUrl(img);
    return { inlineData: { mimeType, data } };
  });

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Optimal for fast reasoning and JSON output
      contents: {
        parts: [
          ...imageParts,
          {
            text: `System: Act as an expert e-commerce catalog optimizer.
            Input Notes: "${rawDescription}".
            Task: Create a professional marketplace listing based on the provided photos and notes.
            Constraint: Return valid JSON with: title, description, keyFeatures (array), and specifications (array of objects with key/value).`,
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
    if (!text) throw new Error("AI output was empty.");
    return JSON.parse(text.trim()) as ProductListing;
  });
};

export const generateImageVariant = async (
  originalImageBase64: string,
  variantType: 'Studio' | 'Lifestyle' | 'Contextual',
  productTitle: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const { mimeType, data } = parseDataUrl(originalImageBase64);

  const prompts = {
    'Studio': `High-end professional studio photography of ${productTitle} on a pure seamless white background. 8k, sharp focus, commercial lighting.`,
    'Lifestyle': `Premium lifestyle catalog photo of ${productTitle} in a modern, aesthetically pleasing home interior. Cinematic natural lighting.`,
    'Contextual': `Close-up macro detail shot of ${productTitle} showing texture and craftsmanship. Magazine quality bokeh background.`
  };

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Native image generation/editing model
      contents: {
        parts: [
          { inlineData: { mimeType, data } },
          { text: prompts[variantType] },
        ],
      },
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    let imageUrl = '';
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageUrl) throw new Error(`Render failed for ${variantType}`);
    return imageUrl;
  });
};