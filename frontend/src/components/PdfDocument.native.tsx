import Pdf from "react-native-pdf";

interface PdfDocumentProps {
  url: string;
  headers: Record<string, string>;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number, pages: number) => void;
  onError: (error: object) => void;
}

export default function PdfDocument({ url, headers, onLoadComplete, onPageChanged, onError }: PdfDocumentProps) {
  return <Pdf source={{ uri: url, headers, cache: false }} style={{ flex: 1, width: "100%" }} fitPolicy={0} minScale={1} maxScale={4} enableDoubleTapZoom onLoadComplete={(pages) => onLoadComplete(pages)} onPageChanged={onPageChanged} onError={onError} />;
}
