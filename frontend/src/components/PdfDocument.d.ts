import { ComponentType } from "react";

declare const PdfDocument: ComponentType<{
  url: string;
  headers: Record<string, string>;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number, pages: number) => void;
  onError: (error: object) => void;
}>;

export default PdfDocument;
