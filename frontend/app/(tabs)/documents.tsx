import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getDb } from "../../src/data/db";
import { genId } from "../../src/data/utils";
import { uploadApi } from "../../src/services/api";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";
import { ChevronRight, File, FileCode2, FileText, Folder, Image, MoreHorizontal, Play, Search, type LucideIcon } from "lucide-react-native";
import FilePicker, { SelectedFile } from "../../src/components/FilePicker";
import UploadPreviewModal from "../../src/components/UploadPreview";

interface DocumentRow { id: string; title: string; cat: string; source: string; last_read_at?: string | null; }
interface Folder { name: string; count: number; }
const folderOf = (category: string) => category.split("/").map((part) => part.trim()).filter(Boolean)[0] || "未分类";

function documentType(doc: DocumentRow) {
  const value = `${doc.title}.${doc.source}`.toLowerCase();
  if (value.includes(".pdf")) return { label: "PDF", icon: FileText, color: colors.document };
  if (value.includes(".md") || value.includes("markdown")) return { label: "Markdown", icon: FileCode2, color: colors.document };
  if (/\.(png|jpg|jpeg|webp)/.test(value)) return { label: "图片", icon: Image, color: colors.document };
  return { label: "文档", icon: File, color: colors.textSecondary };
}

function FolderRow({ folder, onPress, showMeta = true }: { folder: Folder; onPress: () => void; showMeta?: boolean }) {
  return <TouchableOpacity style={styles.folderRow} onPress={onPress}><View style={styles.folderIcon}><Folder size={21} color={colors.document} /></View><View style={styles.rowText}><Text numberOfLines={1} style={styles.rowTitle}>{folder.name}</Text>{showMeta ? <Text style={styles.meta}>{folder.count} 个文件</Text> : null}</View><ChevronRight size={21} color={colors.textSecondary} /></TouchableOpacity>;
}

function RecentRow({ document, onPress }: { document: DocumentRow; onPress: () => void }) {
  const type = documentType(document);
  const TypeIcon = type.icon;
  return <TouchableOpacity style={styles.docRow} onPress={onPress}><View style={styles.typeIcon}><TypeIcon size={19} color={type.color} /></View><View style={styles.rowText}><Text numberOfLines={1} style={styles.rowTitle}>{document.title}</Text><Text style={styles.meta}>{type.label}{document.last_read_at ? ` · ${new Date(document.last_read_at).toLocaleDateString()}` : ""}</Text></View><MoreHorizontal size={20} color={colors.textSecondary} /></TouchableOpacity>;
}

export default function DocumentLibraryScreen() {
  const router = useRouter();
  const { folder } = useLocalSearchParams<{ folder?: string }>();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const loadDocuments = useCallback(async () => { const database = await getDb(); setDocuments(await database.getAllAsync("SELECT id, title, cat, source, last_read_at FROM documents")); }, []);
  useFocusEffect(useCallback(() => { loadDocuments().catch(() => setDocuments([])); }, [loadDocuments]));

  const uploadFile = async (file: SelectedFile, generateQuestions: boolean) => {
    setUploading(true);
    try { setPreviewData(await uploadApi.uploadPdf(file, generateQuestions)); setShowPreview(true); }
    catch (error: any) { Alert.alert("上传失败", error.message || "请检查后端是否已启动"); }
    finally { setUploading(false); }
  };
  const handleFileSelected = (file: SelectedFile) => Alert.alert("选择导入方式", `已选择：${file.name}`, [{ text: "取消", style: "cancel" }, { text: "仅导入原文", onPress: () => uploadFile(file, false) }, { text: "生成题目", onPress: () => uploadFile(file, true) }]);
  const handleConfirm = async (edits: any[], category: string) => {
    if (!previewData) return;
    try {
      const result: any = await uploadApi.confirm({ preview_token: previewData.preview_token, edits, category });
      const database = await getDb();
      const summary = (result.questions || []).map((question: any, index: number) => `## ${index + 1}. ${question.cat}\n\nQ: ${question.q}\n\nA: ${question.a}`).join("\n\n");
      await database.runAsync("INSERT OR REPLACE INTO documents (id, title, cat, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)", [result.document_id, result.file_name, result.category || category, result.content || summary || `来自 ${result.file_name} 的导入文档`, "导入", new Date().toISOString()]);
      for (const question of result.questions || []) {
        const id = genId();
        await database.runAsync("INSERT INTO questions (id, user_id, cat, q, a, source, source_document_id) VALUES (?, 'local', ?, ?, ?, ?, ?)", [id, question.cat, question.q, question.a, question.source || "", question.source_document_id || null]);
        await database.runAsync("INSERT INTO card_progress (id, user_id, question_id, level) VALUES (?, 'local', ?, 0)", [genId(), id]);
      }
      setShowPreview(false); setPreviewData(null); await loadDocuments(); Alert.alert("导入成功", "文档已加入文档库");
    } catch (error: any) { Alert.alert("确认失败", error.message || "请重试"); }
  };

  const folders = useMemo(() => Array.from(documents.reduce((map, doc) => map.set(folderOf(doc.cat), (map.get(folderOf(doc.cat)) ?? 0) + 1), new Map<string, number>()), ([name, count]) => ({ name, count })), [documents]);
  const recent = useMemo(() => [...documents].filter((doc) => doc.last_read_at).sort((a, b) => String(b.last_read_at).localeCompare(String(a.last_read_at))).slice(0, 3), [documents]);
  const recentItems = recent.length > 0 ? recent : documents.slice(0, 3);
  const folderPlaceholders = Math.max(0, 4 - folders.length);
  const recentPlaceholders = Math.max(0, 3 - recentItems.length);
  const directDocuments = folder ? documents.filter((document) => document.cat === folder) : [];
  const subfolders = useMemo(() => {
    if (!folder) return [];
    const prefix = `${folder}/`;
    const grouped = new Map<string, number>();
    documents.filter((document) => document.cat.startsWith(prefix)).forEach((document) => {
      const name = document.cat.slice(prefix.length).split("/")[0]?.trim();
      if (name) grouped.set(name, (grouped.get(name) ?? 0) + 1);
    });
    return Array.from(grouped, ([name, count]) => ({ name, count })).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [documents, folder]);

  if (folder) return <View style={styles.page}>
    <View style={styles.folderHeader}><BackButton onPress={() => router.back()} /><Text numberOfLines={1} style={styles.folderTitle}>{folder.split("/").pop()}</Text><View style={styles.folderActions}><TouchableOpacity accessibilityLabel="刷题" style={styles.folderAction} onPress={() => Alert.alert("刷题", "该文件夹暂无可开始的题目")}><Play size={20} color={colors.learning} fill={colors.learning} /></TouchableOpacity><TouchableOpacity accessibilityLabel="搜索" style={styles.folderAction} onPress={() => Alert.alert("搜索", "搜索功能将在下一阶段开放")}><Search size={20} color={colors.text} /></TouchableOpacity><TouchableOpacity accessibilityLabel="更多" style={styles.folderAction} onPress={() => Alert.alert("更多", "更多操作将在下一阶段开放")}><MoreHorizontal size={21} color={colors.text} /></TouchableOpacity></View></View>
    <ScrollView contentContainerStyle={styles.folderContent} showsVerticalScrollIndicator={false}>
      {subfolders.length > 0 ? <><Text style={styles.sectionTitle}>文件夹</Text>{subfolders.map((item) => <FolderRow key={item.name} folder={item} showMeta={false} onPress={() => router.push({ pathname: "/(tabs)/documents", params: { folder: `${folder}/${item.name}` } })} />)}</> : null}
      <Text style={[styles.sectionTitle, subfolders.length > 0 && styles.filesSectionTitle]}>文件</Text>
      {directDocuments.map((document) => <RecentRow key={document.id} document={document} onPress={() => router.push({ pathname: "/(tabs)/doc-reader", params: { id: document.id } })} />)}
      {directDocuments.length === 0 && subfolders.length === 0 ? <Text style={styles.emptyFolder}>此文件夹暂无文件</Text> : null}
    </ScrollView>
  </View>;

  return <View style={styles.page}>
    <View style={styles.header}><BackButton onPress={() => router.back()} /><Text numberOfLines={1} style={styles.title}>文档库</Text><View style={styles.actions}><TouchableOpacity onPress={() => Alert.alert("搜索", "搜索功能将在下一阶段开放")}><Text style={styles.action}>⌕</Text></TouchableOpacity><FilePicker onFileSelected={handleFileSelected} label="＋" iconOnly /></View></View>
    <View style={styles.content}>
      <View style={styles.folderSection}><Text style={styles.sectionTitle}>文件夹</Text><ScrollView style={styles.sectionList} contentContainerStyle={styles.folderListContent} showsVerticalScrollIndicator={folders.length > 4} nestedScrollEnabled>{folders.map((item) => <FolderRow key={item.name} folder={item} onPress={() => router.push({ pathname: "/(tabs)/documents", params: { folder: item.name } })} />)}{Array.from({ length: folderPlaceholders }, (_, index) => <View key={`folder-placeholder-${index}`} style={styles.folderPlaceholder} />)}</ScrollView></View>
      <View style={styles.recentSection}><Text style={styles.sectionTitle}>最近打开</Text><View style={styles.recentList}>{recentItems.map((document) => <RecentRow key={document.id} document={document} onPress={() => router.push({ pathname: "/(tabs)/doc-reader", params: { id: document.id } })} />)}{Array.from({ length: recentPlaceholders }, (_, index) => <View key={`recent-placeholder-${index}`} style={styles.recentPlaceholder} />)}</View></View>
    </View>
    <UploadPreviewModal visible={showPreview} onClose={() => { setShowPreview(false); setPreviewData(null); }} previewData={previewData} onConfirm={handleConfirm} uploading={uploading} directoryOptions={folders.map((folder) => folder.name)} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 14, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 14 }, title: { flex: 1, color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 30, marginLeft: 3 }, actions: { flexDirection: "row", alignItems: "center", gap: 12 }, action: { color: colors.text, fontSize: 30, lineHeight: 34, fontWeight: "300" },
  content: { flex: 1, minHeight: 0, paddingHorizontal: 20, paddingBottom: 18 }, folderSection: { flex: 1.18, minHeight: 0, overflow: "hidden" }, recentSection: { flex: 1, minHeight: 0, marginTop: 13, overflow: "hidden" }, sectionTitle: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 15, marginBottom: 9 }, sectionList: { flex: 1, minHeight: 0 }, folderListContent: { paddingBottom: 2 },
  folderRow: { minHeight: 68, backgroundColor: colors.surface, borderRadius: 15, padding: 11, flexDirection: "row", alignItems: "center", marginBottom: 6, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, folderPlaceholder: { minHeight: 68, marginBottom: 6 }, folderIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 12 }, folderGlyph: { color: colors.document, fontSize: 22 }, rowText: { flex: 1 }, rowTitle: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 }, meta: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 12, marginTop: 3 }, arrow: { color: colors.textSecondary, fontSize: 29, fontWeight: "300" },
  recentList: { flex: 1, minHeight: 0 }, docRow: { minHeight: 62, backgroundColor: colors.surface, borderRadius: 15, padding: 10, flexDirection: "row", alignItems: "center", marginBottom: 6, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, recentPlaceholder: { minHeight: 62, marginBottom: 6 }, typeIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 11 }, typeGlyph: { fontSize: 17, fontWeight: "700" }, more: { color: colors.textSecondary, letterSpacing: 1, fontSize: 14 },
  folderHeader: { paddingTop: 14, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 18 }, folderTitle: { flex: 1, color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 30, marginLeft: 3 }, folderActions: { flexDirection: "row", alignItems: "center", gap: 5 }, folderAction: { width: 38, height: 42, alignItems: "center", justifyContent: "center" }, folderActionGlyph: { color: colors.text, fontSize: 30, fontWeight: "300", lineHeight: 32 }, folderMore: { color: colors.text, fontSize: 17, letterSpacing: 1.5 }, folderContent: { paddingHorizontal: 20, paddingBottom: 28 }, filesSectionTitle: { marginTop: 22 }, emptyFolder: { color: colors.textSecondary, fontFamily: "MiSans-Regular", textAlign: "center", fontSize: 15, marginTop: 72 },
});
