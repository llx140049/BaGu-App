import { useEffect } from "react";
import { Text, View } from "react-native";

interface PdfDocumentProps {
  url: string;
  headers: Record<string, string>;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number, pages: number) => void;
  onError: (error: object) => void;
}

export default function PdfDocument({ onError }: PdfDocumentProps) {
  useEffect(() => {
    onError(new Error("Expo Go does not include the native PDF preview module."));
  }, [onError]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ textAlign: "center" }}>PDF preview is opened with the system reader in Expo Go.</Text>
    </View>
  );
}
