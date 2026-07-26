import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AlertTriangle, Check, Circle, FileCode2, FileText, LoaderCircle } from "lucide-react-native";
import { BlurView } from "expo-blur";
import { colors } from "../tokens/colors";
import type { SelectedFile } from "./FilePicker";
import { useThemeStore } from "../store/useThemeStore";

export type ImportMode = "original" | "generate";
export type ImportDensity = "low" | "standard" | "high";
export type ImportStage = "reading" | "generating" | "saving";
export type ImportState =
  | { status: "idle" }
  | { status: "working"; mode: ImportMode; stage: ImportStage; progress?: string }
  | { status: "success"; mode: ImportMode; questionCount: number; documentId: string }
  | { status: "failed"; mode: ImportMode; message: string };

export function ImportMethodSheet({ file, visible, onSelect, onClose }: { file: SelectedFile | null; visible: boolean; onSelect: (mode: ImportMode, instructions?: string, density?: ImportDensity) => void; onClose: () => void }) {
  const isDark = useThemeStore((state) => state.theme === "dark");
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const text = isDark ? colors.textDark : colors.text;
  const markdown = /\.(md|markdown|txt|text)$/i.test(file?.name ?? "");
  const FileIcon = markdown ? FileCode2 : FileText;
  const [selectedMode, setSelectedMode] = useState<ImportMode | null>(null);
  const [instructions, setInstructions] = useState("");
  const [density, setDensity] = useState<ImportDensity>("standard");
  useEffect(() => { if (visible) { setSelectedMode(null); setInstructions(""); setDensity("standard"); } }, [file?.uri, visible]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.choiceOverlay} onPress={onClose}>
      <Pressable style={[styles.methodDialog, { backgroundColor: surface }]} onPress={() => undefined}>
        <Text style={[styles.methodTitle, { color: text }]}>选择导入方式</Text>
        <View style={styles.fileInfo}><View style={[styles.fileIcon, { backgroundColor: isDark ? "#2E3038" : colors.iconBackground }]}><FileIcon size={21} color={colors.document} /></View><View style={styles.fileCopy}><Text style={[styles.fileName, { color: text }]} numberOfLines={2}>{file?.name}</Text><Text style={styles.fileType}>{markdown ? "Markdown 文件" : "PDF 文件"}</Text></View></View>
        <TouchableOpacity style={[styles.importChoice, { backgroundColor: selectedMode === "original" ? (isDark ? "#3A3023" : "#fff1e5") : (isDark ? "#2E3038" : "#f1f1f3") }]} onPress={() => setSelectedMode("original")}><Text style={[styles.importChoiceText, selectedMode === "original" && styles.importChoiceTextSelected]}>仅导入原文</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.importChoice, { backgroundColor: selectedMode === "generate" ? (isDark ? "#3A3023" : "#fff1e5") : (isDark ? "#2E3038" : "#f1f1f3") }]} onPress={() => setSelectedMode("generate")}><Text style={[styles.importChoiceText, selectedMode === "generate" && styles.importChoiceTextSelected]}>导入并生成题目</Text></TouchableOpacity>
        {selectedMode === "generate" ? <View style={styles.densityRow}><Text style={styles.densityLabel}>题目密度</Text>{([["low", "精简"], ["standard", "标准"], ["high", "加量"]] as const).map(([value, label]) => <TouchableOpacity key={value} style={[styles.densityChip, { backgroundColor: density === value ? (isDark ? "#3A3023" : "#fff1e5") : (isDark ? "#2E3038" : "#f1f1f3") }]} onPress={() => setDensity(value)}><Text style={[styles.densityText, density === value && styles.densityTextSelected]}>{label}</Text></TouchableOpacity>)}</View> : null}
        {selectedMode === "generate" ? <TextInput value={instructions} onChangeText={setInstructions} multiline maxLength={500} placeholder={"生成要求（可选）\n例：标签统一用 MySQL、Redis、网络 这类大类；答案尽量简短"} placeholderTextColor={colors.textTertiary} style={[styles.instructionsInput, { color: text, backgroundColor: isDark ? "#2E3038" : "#f1f1f3" }]} /> : null}
        <View style={styles.dialogActions}><TouchableOpacity style={styles.dialogAction} onPress={onClose}><Text style={styles.cancelText}>取消</Text></TouchableOpacity><TouchableOpacity style={styles.dialogAction} onPress={() => selectedMode && onSelect(selectedMode, instructions.trim() || undefined, density)} disabled={!selectedMode}><Text style={[styles.confirmText, !selectedMode && styles.confirmTextDisabled]}>确认</Text></TouchableOpacity></View>
      </Pressable>
    </Pressable>
  </Modal>;
}

const stageItems: { id: ImportStage | "parsed"; working: string; done: string }[] = [
  { id: "reading", working: "正在读取文件", done: "已读取文件" },
  { id: "parsed", working: "正在解析文档内容", done: "已解析文档内容" },
  { id: "generating", working: "正在生成题目", done: "已生成题目" },
  { id: "saving", working: "正在保存", done: "已保存到题库" },
];

function stageIndex(stage: ImportStage, mode: ImportMode) {
  if (stage === "reading") return 0;
  if (stage === "generating") return mode === "generate" ? 2 : 3;
  return 3;
}

export function ImportProgressModal({ state, onRetry, onClose, onViewQuestions, onViewDocument, longWait }: { state: ImportState; onRetry: () => void; onClose: () => void; onViewQuestions: () => void; onViewDocument: () => void; longWait: 0 | 5 | 15 }) {
  const isDark = useThemeStore((themeState) => themeState.theme === "dark");
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const text = isDark ? colors.textDark : colors.text;
  const visible = state.status !== "idle";
  const working = state.status === "working";
  const success = state.status === "success";
  const failed = state.status === "failed";
  const current = working ? stageIndex(state.stage, state.mode) : -1;
  const visibleStages = state.status === "working" && state.mode === "original" ? stageItems.filter((item) => item.id !== "generating") : stageItems;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state.status !== "working" || state.stage !== "generating") { spin.stopAnimation(); spin.setValue(0); return; }
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [spin, state]);
  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={working ? () => undefined : onClose}>
    <View style={styles.progressRoot}><BlurView intensity={16} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /><View style={styles.progressOverlay}>
      <View style={[styles.progressCard, { backgroundColor: surface }]}>
        {working ? <><Text style={[styles.progressTitle, { color: text }]}>{state.mode === "generate" ? "正在生成题目..." : "正在导入文档..."}</Text><View style={styles.statusList}>{visibleStages.map((item) => {
          const originalIndex = stageItems.findIndex((stage) => stage.id === item.id);
          const done = originalIndex < current;
          const active = originalIndex === current;
          return <View style={styles.statusRow} key={item.id}>{done ? <View style={styles.doneIcon}><Check size={14} color="#fff" strokeWidth={3} /></View> : active && item.id === "generating" ? <Animated.View style={{ transform: [{ rotate: rotation }] }}><LoaderCircle size={18} color={colors.primary} /></Animated.View> : active ? <Circle size={18} color={colors.primary} /> : <Circle size={18} color={isDark ? "#565963" : "#b5b6bc"} />}<Text style={[styles.statusText, { color: isDark ? "#A9ABB5" : "#9a9aa3" }, active && styles.statusActive, done && { color: text }]}>{done ? item.done : active ? item.working + (working && state.progress ? `（${state.progress}）` : "") : item.working.replace("正在", "")}</Text></View>;
        })}</View></> : null}
        {success ? <><View style={styles.resultIcon}><Check size={28} color="#fff" strokeWidth={3} /></View><Text style={[styles.resultTitle, { color: text }]}>导入完成</Text><View style={styles.resultActions}>{state.mode === "generate" ? <TouchableOpacity style={[styles.resultAction, styles.resultActionSecondary, { backgroundColor: isDark ? "#3A3023" : "#fff1e5" }]} onPress={onViewQuestions}><Text style={[styles.resultPrimaryText, styles.resultSecondaryText]}>查看题目</Text></TouchableOpacity> : null}<TouchableOpacity style={[styles.resultAction, styles.resultActionDocument, { backgroundColor: isDark ? "#2A342A" : "#e8f5e9" }]} onPress={onViewDocument}><Text style={[styles.resultPrimaryText, styles.resultDocumentText]}>查看文档</Text></TouchableOpacity></View><TouchableOpacity style={styles.resultClose} onPress={onClose}><Text style={styles.resultCloseText}>关闭</Text></TouchableOpacity></> : null}
        {failed ? <><View style={[styles.errorIcon, { backgroundColor: isDark ? "#3A292C" : "#fff1e9" }]}><AlertTriangle size={28} color={colors.danger} /></View><Text style={[styles.resultTitle, { color: text }]}>导入失败</Text><Text style={styles.errorLabel}>原因</Text><Text style={[styles.errorMessage, { color: text }]}>{state.message}</Text><TouchableOpacity style={styles.resultPrimary} onPress={onRetry}><Text style={styles.resultPrimaryText}>重试</Text></TouchableOpacity><TouchableOpacity style={styles.resultClose} onPress={onClose}><Text style={styles.resultCloseText}>关闭</Text></TouchableOpacity></> : null}
      </View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  choiceOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  methodDialog: { width: "100%", maxWidth: 360, backgroundColor: colors.surface, borderRadius: 24, padding: 24 },
  methodTitle: { color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 20 },
  fileInfo: { flexDirection: "row", alignItems: "center", marginTop: 18, marginBottom: 20 }, fileIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 12 }, fileCopy: { flex: 1 }, fileName: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16, lineHeight: 22 }, fileType: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 13, marginTop: 3 },
  importChoice: { minHeight: 52, borderRadius: 15, paddingHorizontal: 16, justifyContent: "center", marginBottom: 10, backgroundColor: "#f1f1f3" }, instructionsInput: { minHeight: 64, maxHeight: 120, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, fontFamily: "MiSans-Regular", fontSize: 14, textAlignVertical: "top" }, densityRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }, densityLabel: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 13, marginRight: 2 }, densityChip: { paddingHorizontal: 14, minHeight: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" }, densityText: { color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 13 }, densityTextSelected: { fontFamily: "MiSans-Semibold" }, importChoiceSelected: { backgroundColor: "#fff1e5" }, importChoiceText: { color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 16 }, importChoiceTextSelected: { fontFamily: "MiSans-Semibold" }, dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 6, marginTop: 3 }, dialogAction: { minWidth: 62, minHeight: 34, justifyContent: "center", alignItems: "center" }, cancelText: { color: colors.textSecondary, fontFamily: "MiSans-Medium", fontSize: 16 }, confirmText: { color: colors.primary, fontFamily: "MiSans-Semibold", fontSize: 16 }, confirmTextDisabled: { color: colors.textTertiary },
  progressRoot: { flex: 1 }, progressOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }, progressCard: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: 24, alignItems: "center" }, progressTitle: { color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 20, marginBottom: 20, textAlign: "center" }, statusList: { alignSelf: "center", gap: 17 }, statusRow: { flexDirection: "row", alignItems: "center", gap: 12 }, doneIcon: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }, statusText: { color: "#9a9aa3", fontFamily: "MiSans-Regular", fontSize: 15 }, statusActive: { color: colors.primary, fontFamily: "MiSans-Medium" }, statusDone: { color: colors.text },
  resultIcon: { alignSelf: "center", width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 14 }, errorIcon: { alignSelf: "center", width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff1e9", alignItems: "center", justifyContent: "center", marginBottom: 14 }, resultTitle: { color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 21, textAlign: "center" }, resultDetail: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 14, textAlign: "center", marginTop: 8 }, resultCount: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 15, textAlign: "center", marginTop: 9 }, errorLabel: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 13, marginTop: 20 }, errorMessage: { color: colors.text, fontFamily: "MiSans-Regular", fontSize: 15, lineHeight: 21, marginTop: 4 }, resultActions: { width: "100%", flexDirection: "row", gap: 10, marginTop: 18 }, resultAction: { flex: 1, minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center" }, resultActionPrimary: { backgroundColor: colors.primary }, resultActionSecondary: { backgroundColor: "#fff1e5" }, resultActionDocument: { backgroundColor: "#e8f5e9" }, resultPrimary: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, marginTop: 24 }, resultPrimaryText: { color: "#fff", fontFamily: "MiSans-Semibold", fontSize: 16 }, resultSecondaryText: { color: colors.primary }, resultDocumentText: { color: "#2e7d32" }, resultClose: { minHeight: 38, alignItems: "center", justifyContent: "center", marginTop: 5 }, resultCloseText: { color: colors.textSecondary, fontFamily: "MiSans-Medium", fontSize: 15 },
});
