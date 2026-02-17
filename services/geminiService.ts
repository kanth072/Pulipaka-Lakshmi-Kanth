
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
  // Direct initialization ensures the most current key is picked up
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const imageParts = imagesBase64.map(img => {
    const { mimeType, data } = parseDataUrl(img);
    return { inlineData: { mimeType, data } };
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview", // Fastest reasoning model
    contents: {
      parts: [
        ...imageParts,
        {
          text: `Act as a senior marketplace content specialist. 
          Notes: "${rawDescription}".
          Create a professional SEO listing. 
          Return as JSON with title, description, keyFeatures (array), and specifications (array of objects with key and value).`,
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
  if (!text) throw new Error("Empty AI response.");
  return JSON.parse(text.trim()) as ProductListing;
};

export const generateImageVariant = async (
  originalImageBase64: string,
  variantType: 'Studio' | 'Lifestyle' | 'Contextual',
  productTitle: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const { mimeType, data } = parseDataUrl(originalImageBase64);

  const prompts = {
    'Studio': `Extreme high-quality professional studio product photography of "${productTitle}" on a seamless pure white background. Minimalist commercial aesthetic, sharp focus.`,
    'Lifestyle': `Premium lifestyle catalog photo of "${productTitle}" in a luxurious modern interior. Cinematic soft lighting, high-end production value.`,
    'Contextual': `Professional commercial shot of "${productTitle}" highlighting craftsmanship and design details. Neutral background, magazine quality.`
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image', // Fastest image model for rendering
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

  if (!imageUrl) throw new Error(`Render pipeline failure for ${variantType}.`);
  return imageUrl;
};
