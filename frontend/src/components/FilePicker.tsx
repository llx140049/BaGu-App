import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { colors } from "../tokens/colors";

export interface SelectedFile {
  uri: string;
  name: string;
  bytes?: ArrayBuffer;
  mimeType?: string;
}

interface FilePickerProps {
  onFileSelected: (file: SelectedFile) => void;
  label?: string;
  isDark?: boolean;
  floating?: boolean;
}

export default function FilePicker({ onFileSelected, label = "选择文件", floating = false }: FilePickerProps) {
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (Platform.OS === "web") {
    return (
      <View>
        <TouchableOpacity style={[styles.btn, floating && styles.floatingButton, { backgroundColor: colors.primary }]} onPress={() => inputRef.current?.click()}>
          <Text style={styles.btnText}>{fileName || label}</Text>
        </TouchableOpacity>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.markdown,.txt"
          style={{ display: "none" }}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            onFileSelected({ uri: URL.createObjectURL(file), name: file.name, bytes: await file.arrayBuffer(), mimeType: file.type });
            event.target.value = "";
          }}
        />
      </View>
    );
  }

  const pickNativeFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/markdown", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      setFileName(file.name);
      onFileSelected({ uri: file.uri, name: file.name, mimeType: file.mimeType });
    } catch {
      Alert.alert("选择文件失败", "请重试，或检查应用的文件访问权限。");
    }
  };

  return (
    <View>
      <TouchableOpacity style={[styles.btn, floating && styles.floatingButton, { backgroundColor: colors.primary }]} onPress={pickNativeFile}>
        <Text style={styles.btnText}>{fileName || label}</Text>
      </TouchableOpacity>
      {!floating ? <Text style={[styles.hint, { color: colors.textTertiary }]}>支持 PDF、Markdown 和文本文件</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 14, borderRadius: 10, alignItems: "center" },
  floatingButton: { width: 56, height: 56, borderRadius: 28, padding: 0, justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  hint: { fontSize: 12, textAlign: "center", marginTop: 8, lineHeight: 18 },
});
