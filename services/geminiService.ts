import { GoogleGenAI, Type } from "@google/genai";
import { ProductListing } from "../types";

const parseDataUrl = (dataUrl: string) => {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid image format");
  return { mimeType: matches[1], data: matches[2] };
};

export const generateProfessionalListing = async (
  imagesBase64: string[],
  rawDescription: string
): Promise<ProductListing> => {
  // Always initialize with latest API_KEY to ensure bridge functionality works instantly
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const imageParts = imagesBase64.map(img => {
    const { mimeType, data } = parseDataUrl(img);
    return { inlineData: { mimeType, data } };
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        ...imageParts,
        {
          text: `Act as a senior marketplace content specialist for Flipkart/Amazon.
          Analyze these images and notes: "${rawDescription}".
          
          TASK: Create a professional e-commerce catalog entry.
          
          CRITERIA:
          1. TITLE: [Brand] [Model] [Feature] [Color]. SEO Optimized.
          2. DESCRIPTION: High-conversion copywriting, 3-4 sentences.
          3. KEY FEATURES: Top 5 bullet points.
          4. SPECIFICATIONS: Extract technical specs from visual data as key-value pairs.
          
          Return as JSON.`,
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
  if (!text) throw new Error("Catalog service returned an empty result.");
  return JSON.parse(text.trim()) as ProductListing;
};

export const generateImageVariant = async (
  originalImageBase64: string,
  variantType: 'Studio' | 'Lifestyle' | 'Contextual',
  productTitle: string
): Promise<string> => {
  // Always initialize inside the call for real-time API Key updates
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const { mimeType, data } = parseDataUrl(originalImageBase64);

  const prompts = {
    'Studio': `High-end professional studio catalog photograph of "${productTitle}" on a minimalist clean white background. Uniform lighting, sharp focus, magazine quality. No text.`,
    'Lifestyle': `Premium lifestyle product photo of "${productTitle}" in an elegant home environment. Cinematic depth of field, natural lighting, luxury aesthetic.`,
    'Contextual': `Professional shot showing the "${productTitle}" product in context. Highlighting ergonomic design and scale. Professional commercial lighting.`
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
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

  if (!imageUrl) throw new Error(`Model did not produce an image candidate for ${variantType}.`);
  return imageUrl;
};