import { Platform, View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useState, useRef } from "react";
import { colors } from "../tokens/colors";

interface FilePickerProps {
  onFileSelected: (file: { uri: string; name: string; bytes: ArrayBuffer }) => void;
  label?: string;
  isDark?: boolean;
  floating?: boolean;
}

export default function FilePicker({ onFileSelected, label = "选择文件", isDark, floating = false }: FilePickerProps) {
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Web — hidden file input
  if (Platform.OS === "web") {
    return (
      <View>
        <TouchableOpacity
          style={[styles.btn, floating && styles.floatingButton, { backgroundColor: colors.primary }]}
          onPress={() => inputRef.current?.click()}
        >
          <Text style={styles.btnText}>{fileName || label}</Text>
        </TouchableOpacity>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.markdown,.txt"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            const bytes = await file.arrayBuffer();
            onFileSelected({ uri: URL.createObjectURL(file), name: file.name, bytes });
            e.target.value = "";
          }}
        />
      </View>
    );
  }

  // Native — use phone browser for upload instead
  return (
    <View>
      <TouchableOpacity
        style={[styles.btn, floating && styles.floatingButton, { backgroundColor: colors.primary }]}
        onPress={() => {
          Alert.alert(
            "通过浏览器上传",
            "请在电脑浏览器打开 http://192.168.2.11:8081 ，或打开手机浏览器访问同一地址进行上传",
          );
        }}
      >
        <Text style={styles.btnText}>📄 {label}</Text>
      </TouchableOpacity>
      {!floating ? <Text style={[styles.hint, { color: colors.textTertiary }]}>
        ⚠️ 手机端暂不支持文件选择，请使用 Web 版上传
      </Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 14, borderRadius: 10, alignItems: "center" },
  floatingButton: { width: 56, height: 56, borderRadius: 28, padding: 0, justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  hint: { fontSize: 12, textAlign: "center", marginTop: 8, lineHeight: 18 },
});
