
export interface ProductListing {
  title: string;
=originalImage: string | null;
  rawDescription: string;
  isProcessing: boolean;
  listing: ProductListing | null;
  variants: GeneratedVariant[];
  error: string | null;
  statusMessage: string;
}
