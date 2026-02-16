
export interface ProductListing {
  title: string;
  description: string;
  keyFeatures: string[];
  specifications: { key: string; value: string }[];
}

export interface GeneratedVariant {
  id: string;
  url: string;
  type: 'Studio' | 'Lifestyle' | 'Contextual';
  prompt: string;
}

export interface AppState {
  originalImages: string[];
  rawDescription: string;
  isProcessing: boolean;
  listing: ProductListing | null;
  variants: GeneratedVariant[];
  error: string | null;
  statusMessage: string;
}
