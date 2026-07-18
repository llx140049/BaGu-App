import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { ChevronLeft, ExternalLink } from "lucide-react-native";
import PdfDocument from "../src/components/PdfDocument";
import { documentsApi } from "../src/services/api";
import { colors } from "../src/tokens/colors";
import { useThemeStore } from "../src/store/useThemeStore";

export default function PdfReaderScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";
  const [request, setRequest] = useState<{ url: string; headers: Record<string, string> } | null>(null);
  const [localPdf, setLocalPdf] = useState<{ uri: string; contentUri: string } | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState("");
  const handlePdfError = useCallback(() => setError("PDF 加载失败，请检查网络后重试"), []);

  useEffect(() => {
    let active = true;
    documentsApi.getOriginalFileRequest(id).then(async (nextRequest) => {
      const file = await File.downloadFileAsync(
        nextRequest.url,
        new File(Paths.cache, `document-${id}.pdf`),
        { headers: nextRequest.headers, idempotent: true }
      );
      if (active) {
        setRequest(nextRequest);
        setLocalPdf(file);
      }
    }).catch((loadError: any) => { if (active) setError(loadError?.message || "无法加载原始 PDF"); });
    return () => { active = false; };
  }, [id]);

  const openExternally = async () => {
    if (!request) return;
    try {
      const file = localPdf ?? await File.downloadFileAsync(request.url, new File(Paths.cache, `${id}.pdf`), { headers: request.headers, idempotent: true });
      if (Platform.OS === "android") await IntentLauncher.startActivityAsync("android.intent.action.VIEW", { data: file.contentUri, type: "application/pdf", flags: 1 });
      else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "打开原 PDF" });
      else throw new Error("当前设备没有可用的 PDF 打开方式");
    } catch (openError: any) { Alert.alert("打开失败", openError?.message || "请稍后重试"); }
  };

  const backgroundColor = isDark ? colors.bgDark : colors.bg;
  const textColor = isDark ? colors.textDark : colors.text;
  const mutedColor = isDark ? colors.textTertiary : colors.textSecondary;
  return <View style={[styles.page, { backgroundColor }]}>
    <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
      <TouchableOpacity accessibilityLabel="返回" style={styles.headerButton} onPress={() => router.back()}><ChevronLeft size={25} color={textColor} /></TouchableOpacity>
      <View style={styles.headerTitleWrap}><Text numberOfLines={1} style={[styles.title, { color: textColor }]}>{title || "原始 PDF"}</Text>{pages > 0 ? <Text style={[styles.pageCount, { color: mutedColor }]}>{page || 1} / {pages}</Text> : null}</View>
      <TouchableOpacity accessibilityLabel="用其他应用打开" style={styles.headerButton} onPress={openExternally}><ExternalLink size={20} color={textColor} /></TouchableOpacity>
    </View>
    {!localPdf && !error ? <View style={styles.center}><ActivityIndicator color={colors.document} /><Text style={[styles.statusText, { color: mutedColor }]}>正在加载原始 PDF…</Text></View> : null}
    {localPdf && !error ? <PdfDocument url={localPdf.uri} headers={{}} onLoadComplete={setPages} onPageChanged={(nextPage: number) => setPage(nextPage)} onError={handlePdfError} /> : null}
    {error ? <View style={styles.center}><Text style={[styles.errorTitle, { color: textColor }]}>无法显示 PDF</Text><Text style={[styles.statusText, { color: mutedColor }]}>{error}</Text>{request ? <TouchableOpacity style={styles.externalButton} onPress={openExternally}><ExternalLink size={18} color={colors.document} /><Text style={styles.externalButtonText}>用其他应用打开</Text></TouchableOpacity> : null}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, header: { height: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8 }, headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, headerTitleWrap: { flex: 1, alignItems: "center", minWidth: 0 }, title: { fontSize: 16, fontFamily: "MiSans-Medium" }, pageCount: { fontSize: 12, marginTop: 1 }, center: { flex: 1, paddingHorizontal: 32, alignItems: "center", justifyContent: "center" }, statusText: { marginTop: 12, fontSize: 14, textAlign: "center", lineHeight: 21 }, errorTitle: { fontSize: 17, fontFamily: "MiSans-Medium" }, externalButton: { marginTop: 22, paddingHorizontal: 16, height: 42, borderRadius: 21, backgroundColor: colors.documentLight, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, externalButtonText: { color: colors.document, fontSize: 14, fontFamily: "MiSans-Medium" },
});
