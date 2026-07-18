import { useEffect } from "react";
import { Text, View } from "react-native";

interface PdfDocumentProps {
  url: string;
  headers: Record<string, string>;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number, pages: number) => void;
  onError: (error: object) => void;
}

export default function PdfDocument({ url, headers, onError }: PdfDocumentProps) {
  useEffect(() => {
    let objectUrl = "";
    fetch(url, { headers }).then((response) => {
      if (!response.ok) throw new Error("无法加载原始 PDF");
      return response.blob();
    }).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank");
    }).catch(onError);
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, headers, onError]);
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text>正在浏览器中打开 PDF…</Text></View>;
}
