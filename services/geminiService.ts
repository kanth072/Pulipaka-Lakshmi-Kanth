
import { GoogleGenAI, Type } from "@google/genai";
import { ProductListing } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Extracts the base64 data and mime type from a data URL
 */
const parseDataUrl = (dataUrl: string) => {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid image format");
  return { mimeType: matches[1], data: matches[2] };
};

export const generateProfessionalListing = async (
  imagesBase64: string[],
  rawDescription: string
): Promise<ProductListing> => {
  const imageParts = imagesBase64.map(img => {
    const { mimeType, data } = parseDataUrl(img);
    return {
      inlineData: {
        mimeType,
        data,
      },
    };
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        ...imageParts,
        {
          text: `Act as an expert Flipkart Catalog Manager. 
          Analyze these product images (multiple angles) and these raw notes: "${rawDescription}".
          
          TASK: Generate a professional product listing that meets Flipkart Marketplace Quality Standards based on the visual evidence across all photos.
          
          FLIPKART STANDARDS:
          1. TITLE: Must follow: [Brand Name] [Model/Series] [Primary Feature] [Material] [Color]. Max 150 chars.
          2. DESCRIPTION: Write a professional 3-4 sentence paragraph. Start with the most important benefit. Use SEO keywords naturally. Focus on 'Why buy this?'.
          3. KEY FEATURES: Provide 5 high-impact bullet points. Each bullet should be 5-10 words.
          4. SPECIFICATIONS: Extract technical specs like 'Material', 'Weight', 'Dimensions', 'Color', 'Compatible With', etc.
          
          Output the response strictly as valid JSON.`,
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
          keyFeatures: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
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

  if (!response.text) throw new Error("No response text from Gemini");
  return JSON.parse(response.text.trim()) as ProductListing;
};

export const generateImageVariant = async (
  originalImageBase64: string,
  variantType: 'Studio' | 'Lifestyle' | 'Contextual',
  productTitle: string
): Promise<string> => {
  const { mimeType, data } = parseDataUrl(originalImageBase64);

  const prompts = {
    'Studio': `High-end professional studio catalog photography of ${productTitle}, crisp white background, perfectly centered, soft commercial lighting, ultra-sharp focus, 8k resolution.`,
    'Lifestyle': `Premium lifestyle product shot of ${productTitle} in a modern aesthetically pleasing Indian home setting, natural window lighting, cinematic depth of field.`,
    'Contextual': `Action/Use-case shot of ${productTitle} being handled or used, highlighting its scale and ergonomics, professional color grading, magazine quality.`
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: data,
          },
        },
        {
          text: prompts[variantType],
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
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

  if (!imageUrl) throw new Error(`Failed to generate ${variantType} image variant`);
  return imageUrl;
};
