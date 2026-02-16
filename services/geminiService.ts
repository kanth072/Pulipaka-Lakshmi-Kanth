
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
  // Fix: Create instance inside function to use current process.env.API_KEY.
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
          text: `Act as a senior marketplace content specialist. 
          Analyze the attached product photos and these raw details: "${rawDescription}".
          
          TASK: Create a professional e-commerce listing suitable for Flipkart/Amazon.
          
          GUIDELINES:
          1. TITLE: Structured as [Brand] [Model] [Main Feature] [Color]. High SEO value.
          2. DESCRIPTION: Persuasive, benefits-driven, 3-4 sentences.
          3. KEY FEATURES: List 5 distinct selling points.
          4. SPECIFICATIONS: Extract key data (Material, Dimensions, etc.) into key-value pairs.
          
          Return as structured JSON.`,
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
  if (!text) throw new Error("Catalog engine returned an empty response.");
  return JSON.parse(text.trim()) as ProductListing;
};

export const generateImageVariant = async (
  originalImageBase64: string,
  variantType: 'Studio' | 'Lifestyle' | 'Contextual',
  productTitle: string
): Promise<string> => {
  // Fix: Create instance inside function to ensure latest API key usage.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const { mimeType, data } = parseDataUrl(originalImageBase64);

  // Refinement: Include productTitle in prompts to improve image generation accuracy.
  const prompts = {
    'Studio': `High-end professional studio product photograph of "${productTitle}" on a clean white background. Perfect center composition, soft commercial lighting, ultra-sharp 8k resolution. No text, no logos.`,
    'Lifestyle': `Realistic lifestyle photograph of "${productTitle}" placed in a modern, luxury aesthetically pleasing home setting. Soft sunlight from a window, cinematic depth of field, magazine quality.`,
    'Contextual': `A professional action shot showing "${productTitle}" being used by a person in its intended environment. Highlights ergonomics and scale. Natural motion blur, high-end photography.`
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
      // Fix: Ensure we correctly extract the inlineData part which contains the generated image.
      if (part.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  if (!imageUrl) throw new Error(`Image model did not return a valid asset for ${variantType}.`);
  return imageUrl;
};
