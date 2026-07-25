import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { colors } from "../tokens/colors";

export interface SelectedFile { uri: string; name: string; bytes?: ArrayBuffer; mimeType?: string; size?: number; }

const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

interface FilePickerProps {
  onFileSelected: (file: SelectedFile) => void;
  label?: string;
  isDark?: boolean;
  floating?: boolean;
  iconOnly?: boolean;
}

function readableFileName(name?: string, uri?: string) {
  const fallback = uri?.split("/").pop() || "untitled";
  let value = name || fallback;
  try {
    value = decodeURIComponent(value);
  } catch {}
  const parts = value.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "untitled";
}

function ensureSupportedExtension(name: string, mimeType?: string) {
  const trimmed = name.trim();
  if (/\.[a-z0-9]+$/i.test(trimmed)) return trimmed;
  if (mimeType === "application/pdf") return `${trimmed}.pdf`;
  if (mimeType === "text/markdown" || mimeType === "text/plain" || mimeType?.startsWith("text/")) return `${trimmed}.md`;
  return trimmed;
}

export default function FilePicker({ onFileSelected, label = "选择文件", isDark = false, floating = false, iconOnly = false }: FilePickerProps) {
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonStyle = [styles.button, floating && styles.floatingButton, iconOnly && styles.iconOnlyButton, { backgroundColor: iconOnly ? "transparent" : colors.primary }];
  const labelStyle = [styles.buttonText, iconOnly && styles.iconOnlyText, iconOnly && { color: isDark ? colors.textDark : colors.text }];

  if (Platform.OS === "web") {
    return (
      <View>
        <TouchableOpacity style={buttonStyle} onPress={() => inputRef.current?.click()}>
          <Text style={labelStyle}>{iconOnly ? label : (fileName || label)}</Text>
        </TouchableOpacity>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.markdown,.txt,text/*"
          style={{ display: "none" }}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > MAX_UPLOAD_SIZE_BYTES) {
              Alert.alert("文件过大", "单个文件最大支持100MB。");
              event.target.value = "";
              return;
            }
            const name = ensureSupportedExtension(readableFileName(file.name, file.name), file.type);
            setFileName(name);
            onFileSelected({ uri: URL.createObjectURL(file), name, bytes: await file.arrayBuffer(), mimeType: file.type, size: file.size });
            event.target.value = "";
          }}
        />
      </View>
    );
  }

  const pickNativeFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/*", "text/markdown", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      if (file.size && file.size > MAX_UPLOAD_SIZE_BYTES) {
        Alert.alert("文件过大", "单个文件最大支持100MB。");
        return;
      }
      const name = ensureSupportedExtension(readableFileName(file.name, file.uri), file.mimeType);
      setFileName(name);
      onFileSelected({ uri: file.uri, name, mimeType: file.mimeType, size: file.size });
    } catch {
      Alert.alert("选择文件失败", "请重试，或检查应用的文件访问权限。");
    }
  };

  return (
    <View>
      <TouchableOpacity style={buttonStyle} onPress={pickNativeFile}>
        <Text style={labelStyle}>{iconOnly ? label : (fileName || label)}</Text>
      </TouchableOpacity>
      {!floating && !iconOnly ? <Text style={[styles.hint, { color: colors.textTertiary }]}>支持 PDF、Markdown 和文本文件，最大100MB</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { padding: 14, borderRadius: 10, alignItems: "center" },
  floatingButton: { width: 56, height: 56, borderRadius: 28, padding: 0, justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  iconOnlyButton: { width: 38, height: 38, padding: 0, justifyContent: "center" },
  buttonText: { color: "#fff", fontFamily: "MiSans-Medium", fontSize: 15 },
  iconOnlyText: { color: colors.text, fontFamily: "MiSans-Regular", fontSize: 36, lineHeight: 40 },
  hint: { fontFamily: "MiSans-Regular", fontSize: 12, textAlign: "center", marginTop: 8, lineHeight: 18 },
});
