import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getDb } from "../../src/data/db";
import { genId } from "../../src/data/utils";
import { syncApi, uploadApi } from "../../src/services/api";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";
import { CheckCircle2, ChevronLeft, ChevronRight, File, FileCode2, FileText, Folder, Image, MoreHorizontal, Play, Search, Trash2, X, type LucideIcon } from "lucide-react-native";
import FilePicker, { SelectedFile } from "../../src/components/FilePicker";
import { ImportDensity, ImportMethodSheet, ImportMode, ImportProgressModal, ImportState } from "../../src/components/DocumentImportFlow";
import UploadPreviewModal from "../../src/components/UploadPreview";
import { useThemeStore } from "../../src/store/useThemeStore";
import { pruneEmptyStudyPlanItems } from "../../src/data/study-plan";

interface DocumentRow { id: string; title: string; cat: string; content: string; source: string; last_read_at?: string | null; }
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
  const isDark = useThemeStore((state) => state.theme === "dark");
  return <TouchableOpacity style={[styles.folderRow, { backgroundColor: isDark ? colors.surfaceDark : colors.surface }]} onPress={onPress}><View style={[styles.folderIcon, { backgroundColor: isDark ? "#2E3038" : colors.iconBackground }]}><Folder size={21} color={colors.document} /></View><View style={styles.rowText}><Text numberOfLines={1} style={[styles.rowTitle, { color: isDark ? colors.textDark : colors.text }]}>{folder.name}</Text>{showMeta ? <Text style={styles.meta}>{folder.count} 个文件</Text> : null}</View><ChevronRight size={21} color={colors.textSecondary} /></TouchableOpacity>;
}

function RecentRow({ document, onPress }: { document: DocumentRow; onPress: () => void }) {
  const type = documentType(document);
  const TypeIcon = type.icon;
  const isDark = useThemeStore((state) => state.theme === "dark");
  return <TouchableOpacity style={[styles.docRow, { backgroundColor: isDark ? colors.surfaceDark : colors.surface }]} onPress={onPress}><View style={[styles.typeIcon, { backgroundColor: isDark ? "#2E3038" : colors.iconBackground }]}><TypeIcon size={19} color={type.color} /></View><View style={styles.rowText}><Text numberOfLines={1} style={[styles.rowTitle, { color: isDark ? colors.textDark : colors.text }]}>{document.title}</Text><Text style={styles.meta}>{type.label}{document.last_read_at ? ` · ${new Date(document.last_read_at).toLocaleDateString()}` : ""}</Text></View><MoreHorizontal size={20} color={colors.textSecondary} /></TouchableOpacity>;
}

function SelectableRecentRow({ document, selected, selectionMode, onPress, onLongPress }: { document: DocumentRow; selected: boolean; selectionMode: boolean; onPress: () => void; onLongPress: () => void }) {
  const type = documentType(document);
  const TypeIcon = type.icon;
  const isDark = useThemeStore((state) => state.theme === "dark");
  return <TouchableOpacity style={[styles.docRow, { backgroundColor: selected ? (isDark ? "#353740" : "#f1f2f4") : (isDark ? colors.surfaceDark : colors.surface) }]} onPress={onPress} onLongPress={onLongPress}><View style={[styles.typeIcon, { backgroundColor: isDark ? "#2E3038" : colors.iconBackground }]}><TypeIcon size={19} color={type.color} /></View><View style={styles.rowText}><Text numberOfLines={1} style={[styles.rowTitle, { color: isDark ? colors.textDark : colors.text }]}>{document.title}</Text><Text style={styles.meta}>{type.label}{document.last_read_at ? ` · ${new Date(document.last_read_at).toLocaleDateString()}` : ""}</Text></View>{selectionMode ? <CheckCircle2 size={21} color={selected ? colors.document : (isDark ? "#565963" : "#c8c9cf")} fill={selected ? "#fff" : "transparent"} /> : null}</TouchableOpacity>;
}

function DocumentSelectionBar({ count, onCancel, onDelete }: { count: number; onCancel: () => void; onDelete: () => void }) {
  const isDark = useThemeStore((state) => state.theme === "dark");
  return <View style={styles.selectionBar}><TouchableOpacity style={styles.cancelSelection} onPress={onCancel}><Text style={[styles.cancelSelectionText, { color: isDark ? colors.textDark : colors.text }]}>{"\u53d6\u6d88"}</Text></TouchableOpacity><Text style={[styles.selectionTitle, { color: isDark ? colors.textDark : colors.text }]}>{"\u5df2\u9009"} {count} {"\u9879"}</Text><TouchableOpacity accessibilityLabel="batch delete documents" style={styles.selectionDelete} onPress={onDelete}><Trash2 size={20} color={colors.danger} /></TouchableOpacity></View>;
}

function DocumentDeleteDialog({ visible, count, deleteRelatedQuestions, onChangeDeleteRelated, onClose, onConfirm }: { visible: boolean; count: number; deleteRelatedQuestions: boolean; onChangeDeleteRelated: (value: boolean) => void; onClose: () => void; onConfirm: () => void }) {
  const isDark = useThemeStore((state) => state.theme === "dark");
  const text = isDark ? colors.textDark : colors.text;
  const optionBackground = isDark ? "#2E3038" : "#f1f1f3";
  const selectedOptionBackground = isDark ? "#353740" : "#f1f2f4";
  const uncheckedColor = isDark ? "#565963" : "#c8c9cf";
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.deleteOverlay} onPress={onClose}><Pressable style={[styles.deleteDialog, { backgroundColor: isDark ? colors.surfaceDark : colors.surface }]} onPress={() => undefined}><Text style={[styles.deleteTitle, { color: text }]}>{"\u5220\u9664\u6587\u6863"}</Text><TouchableOpacity style={[styles.deleteOption, { backgroundColor: !deleteRelatedQuestions ? selectedOptionBackground : optionBackground }]} onPress={() => onChangeDeleteRelated(false)}><View style={styles.deleteOptionCopy}><Text style={[styles.deleteOptionTitle, { color: text }]}>{"\u4fdd\u7559\u5173\u8054\u9898\u76ee"}</Text></View><CheckCircle2 size={21} color={!deleteRelatedQuestions ? colors.document : uncheckedColor} fill={!deleteRelatedQuestions ? "#fff" : "transparent"} /></TouchableOpacity><TouchableOpacity style={[styles.deleteOption, { backgroundColor: deleteRelatedQuestions ? selectedOptionBackground : optionBackground }]} onPress={() => onChangeDeleteRelated(true)}><View style={styles.deleteOptionCopy}><Text style={[styles.deleteOptionTitle, { color: text }]}>{"\u540c\u65f6\u5220\u9664\u5173\u8054\u9898\u76ee"}</Text></View><CheckCircle2 size={21} color={deleteRelatedQuestions ? colors.document : uncheckedColor} fill={deleteRelatedQuestions ? "#fff" : "transparent"} /></TouchableOpacity><View style={styles.deleteActions}><TouchableOpacity style={styles.deleteCancel} onPress={onClose}><Text style={styles.deleteCancelText}>{"\u53d6\u6d88"}</Text></TouchableOpacity><TouchableOpacity style={styles.deleteConfirm} onPress={onConfirm}><Text style={styles.deleteConfirmText}>{"\u5220\u9664"}</Text></TouchableOpacity></View></Pressable></Pressable></Modal>;
}

function DocumentSearchHeader({ query, onChangeQuery, onClose }: { query: string; onChangeQuery: (value: string) => void; onClose: () => void }) {
  const isDark = useThemeStore((state) => state.theme === "dark");
  const text = isDark ? colors.textDark : colors.text;
  return <View style={styles.searchHeader}><TouchableOpacity accessibilityLabel="退出搜索" style={styles.searchHeaderButton} onPress={onClose}><ChevronLeft size={25} color={text} /></TouchableOpacity><View style={[styles.searchInputWrap, { backgroundColor: isDark ? "#2E3038" : colors.iconBackground }]}><Search size={18} color={colors.textSecondary} /><TextInput autoFocus value={query} onChangeText={onChangeQuery} placeholder="搜索文档" placeholderTextColor={colors.textTertiary} style={[styles.searchInput, { color: text }]} returnKeyType="search" /><TouchableOpacity accessibilityLabel="清除搜索内容" style={styles.clearSearchButton} onPress={() => onChangeQuery("")} disabled={!query}>{query ? <X size={18} color={colors.textSecondary} /> : null}</TouchableOpacity></View></View>;
}

function SearchResultRow({ document, onPress }: { document: DocumentRow; onPress: () => void }) {
  const type = documentType(document);
  const TypeIcon = type.icon;
  const isDark = useThemeStore((state) => state.theme === "dark");
  return <TouchableOpacity style={[styles.docRow, { backgroundColor: isDark ? colors.surfaceDark : colors.surface }]} onPress={onPress}><View style={[styles.typeIcon, { backgroundColor: isDark ? "#2E3038" : colors.iconBackground }]}><TypeIcon size={19} color={type.color} /></View><View style={styles.rowText}><Text numberOfLines={1} style={[styles.rowTitle, { color: isDark ? colors.textDark : colors.text }]}>{document.title}</Text><Text numberOfLines={1} style={styles.meta}>{type.label}{document.cat ? ` · ${document.cat}` : ""}</Text></View><ChevronRight size={20} color={colors.textSecondary} /></TouchableOpacity>;
}

export default function DocumentLibraryScreen() {
  const router = useRouter();
  const isDark = useThemeStore((state) => state.theme === "dark");
  const bg = isDark ? colors.bgDark : colors.bg;
  const text = isDark ? colors.textDark : colors.text;
  const { folder } = useLocalSearchParams<{ folder?: string }>();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [methodSheetVisible, setMethodSheetVisible] = useState(false);
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const [longWait, setLongWait] = useState<0 | 5 | 15>(0);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteRelatedQuestions, setDeleteRelatedQuestions] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [genInstructions, setGenInstructions] = useState("");
  const [genDensity, setGenDensity] = useState<ImportDensity>("standard");
  const loadDocuments = useCallback(async () => { const database = await getDb(); setDocuments(await database.getAllAsync("SELECT id, title, cat, content, source, last_read_at FROM documents")); }, []);
  useFocusEffect(useCallback(() => { loadDocuments().catch(() => setDocuments([])); }, [loadDocuments]));

  useEffect(() => {
    if (importState.status !== "working") { setLongWait(0); return; }
    const afterFive = setTimeout(() => setLongWait(5), 5000);
    const afterFifteen = setTimeout(() => setLongWait(15), 15000);
    return () => { clearTimeout(afterFive); clearTimeout(afterFifteen); };
  }, [importState.status]);

  const saveImport = async (previewData: any, mode: ImportMode, edits: any[], category: string) => {
    setImportState({ status: "working", mode, stage: "saving" });
    try {
      const result: any = await uploadApi.confirm({ preview_token: previewData.preview_token, edits, category });
      const database = await getDb();
      const summary = (result.questions || []).map((question: any, index: number) => `## ${index + 1}. ${question.cat}\n\nQ: ${question.q}\n\nA: ${question.a}`).join("\n\n");
      await database.runAsync("INSERT OR REPLACE INTO documents (id, title, cat, content, source, has_original_file, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [result.document_id, result.file_name, result.category || category || "导入文档", result.content || summary || `来自 ${result.file_name} 的导入文档`, "导入", result.has_original_file ? 1 : 0, new Date().toISOString()]);
      await database.runAsync("UPDATE documents SET tags = ? WHERE id = ?", [JSON.stringify(result.tags || []), result.document_id]);
      for (const question of result.questions || []) {
        const id = genId();
        await database.runAsync("INSERT INTO questions (id, user_id, cat, q, a, source, source_document_id) VALUES (?, 'local', ?, ?, ?, ?, ?)", [id, question.cat, question.q, question.a, question.source || "", question.source_document_id || null]);
        await database.runAsync("UPDATE questions SET tags = ? WHERE id = ?", [JSON.stringify(question.tags || result.tags || []), id]);
        await database.runAsync("INSERT INTO card_progress (id, user_id, question_id, level) VALUES (?, 'local', ?, 0)", [genId(), id]);
      }
      await loadDocuments();
      setImportState({ status: "success", mode, questionCount: (result.questions || []).length, documentId: result.document_id });
    } catch (error: any) {
      const message = /network|failed to fetch|网络/i.test(error?.message || "") ? "网络异常，请检查网络后重试" : (error?.message || "保存失败，请稍后重试");
      setImportState({ status: "failed", mode, message });
    }
  };
  const openPreview = (data: any) => {
    setPreviewData(data);
    setImportState({ status: "idle" });
    setShowPreview(true);
  };
  const startImport = async (mode: ImportMode, instructions?: string, density?: ImportDensity) => {
    if (!selectedFile) return;
    // 记住本次要求和密度，重试时沿用；显式传入则覆盖
    const appliedInstructions = instructions !== undefined ? instructions : genInstructions;
    const appliedDensity = density !== undefined ? density : genDensity;
    setGenInstructions(appliedInstructions);
    setGenDensity(appliedDensity);
    setMethodSheetVisible(false);
    setImportState({ status: "working", mode, stage: "reading" });
    try {
      const parsed = await uploadApi.uploadPdf(selectedFile, false, (progress) => setImportState({ status: "working", mode, stage: "reading", progress }));
      if (mode === "generate") {
        setImportState({ status: "working", mode, stage: "generating" });
        // 生成放到后端后台执行并轮询，避免长请求被代理约 100 秒超时掐断
        await uploadApi.generateQuestionsAsync(parsed.preview_token, appliedInstructions || undefined, appliedDensity);
        const startedAt = Date.now();
        let pollFailures = 0;
        for (;;) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          if (Date.now() - startedAt > 30 * 60 * 1000) throw new Error("生成超时，请重试");
          let generation: any;
          try {
            generation = await uploadApi.generateStatus(parsed.preview_token);
            pollFailures = 0;
          } catch (pollError: any) {
            if (/ 404\b/.test(pollError?.message || "")) throw new Error("导入数据已过期，请重新选择文件");
            pollFailures += 1;
            if (pollFailures >= 5) throw pollError;
            continue;
          }
          if (generation.generation_status === "done") { openPreview(generation.preview); break; }
          if (generation.generation_status === "failed") throw new Error(generation.detail || "生成失败，请重试");
          setImportState({
            status: "working", mode, stage: "generating",
            progress: generation.total_chunks ? `${generation.done_chunks}/${generation.total_chunks} 段` : undefined,
          });
        }
      } else {
        openPreview(parsed);
      }
    } catch (error: any) {
      const message = /network|failed to fetch|网络/i.test(error?.message || "") ? "网络异常，请检查网络后重试" : (error?.message || "导入服务暂不可用，请稍后重试");
      setImportState({ status: "failed", mode, message });
    }
  };
  const handleFileSelected = (file: SelectedFile) => { setSelectedFile(file); setMethodSheetVisible(true); };
  const exitSelection = () => setSelectedDocumentIds(new Set());
  const enterSelection = (id: string) => setSelectedDocumentIds(new Set([id]));
  const toggleSelection = (id: string) => setSelectedDocumentIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const confirmBatchDelete = () => { setDeleteRelatedQuestions(true); setDeleteDialogVisible(true); };
  const deleteDocuments = async () => {
    const database = await getDb();
    try {
      await syncApi.deleteDocuments(Array.from(selectedDocumentIds), deleteRelatedQuestions);
    } catch (error: any) {
      Alert.alert("删除失败", error?.message || "无法同步删除，请检查登录状态和网络后重试。");
      return;
    }
    for (const documentId of selectedDocumentIds) {
      if (deleteRelatedQuestions) {
        await database.runAsync("DELETE FROM card_progress WHERE question_id IN (SELECT id FROM questions WHERE source_document_id = ?)", [documentId]);
        await database.runAsync("DELETE FROM questions WHERE source_document_id = ?", [documentId]);
      } else {
        await database.runAsync("UPDATE questions SET source_document_id = NULL WHERE source_document_id = ?", [documentId]);
      }
      await database.runAsync("DELETE FROM documents WHERE id = ?", [documentId]);
    }
    if (deleteRelatedQuestions) await pruneEmptyStudyPlanItems();
    setDeleteDialogVisible(false);
    exitSelection();
    await loadDocuments();
  };
  const closeSearch = () => { setSearchVisible(false); setSearchQuery(""); };

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
  const searchResults = useMemo(() => {
    const keyword = searchQuery.trim().toLocaleLowerCase();
    if (!keyword) return [];
    const scopedDocuments = folder ? documents.filter((document) => document.cat === folder || document.cat.startsWith(`${folder}/`)) : documents;
    return scopedDocuments.filter((document) => `${document.title}\n${document.cat}\n${document.content}`.toLocaleLowerCase().includes(keyword));
  }, [documents, folder, searchQuery]);

  if (searchVisible) return <View style={[styles.page, { backgroundColor: bg }]}>
    <DocumentSearchHeader query={searchQuery} onChangeQuery={setSearchQuery} onClose={closeSearch} />
    <ScrollView contentContainerStyle={styles.searchContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {!searchQuery.trim() ? <Text style={[styles.searchHint, { color: text }]}>输入关键词，搜索文件名、保存位置或正文内容</Text> : searchResults.map((document) => <SearchResultRow key={document.id} document={document} onPress={() => router.push({ pathname: "/(tabs)/doc-reader", params: { id: document.id } })} />)}
      {searchQuery.trim() && searchResults.length === 0 ? <Text style={[styles.searchEmpty, { color: text }]}>没有找到相关文档</Text> : null}
    </ScrollView>
  </View>;

  if (folder) return <View style={[styles.page, { backgroundColor: bg }]}>
    {selectedDocumentIds.size > 0 ? <DocumentSelectionBar count={selectedDocumentIds.size} onCancel={exitSelection} onDelete={confirmBatchDelete} /> : <View style={styles.folderHeader}><BackButton onPress={() => router.back()} /><Text numberOfLines={1} style={[styles.folderTitle, { color: text }]}>{folder.split("/").pop()}</Text><View style={styles.folderActions}><TouchableOpacity accessibilityLabel="刷题" style={styles.folderAction} onPress={() => Alert.alert("刷题", "该文件夹暂无可开始的题目")}><Play size={20} color={colors.learning} fill={colors.learning} /></TouchableOpacity><TouchableOpacity accessibilityLabel="搜索文档" style={styles.folderAction} onPress={() => setSearchVisible(true)}><Search size={20} color={text} /></TouchableOpacity><TouchableOpacity accessibilityLabel="更多" style={styles.folderAction} onPress={() => Alert.alert("更多", "更多操作将在下一阶段开放")}><MoreHorizontal size={21} color={text} /></TouchableOpacity></View></View>}
    <ScrollView contentContainerStyle={styles.folderContent} showsVerticalScrollIndicator={false}>
      {subfolders.length > 0 ? <><Text style={styles.sectionTitle}>文件夹</Text>{subfolders.map((item) => <FolderRow key={item.name} folder={item} showMeta={false} onPress={() => router.push({ pathname: "/(tabs)/documents", params: { folder: `${folder}/${item.name}` } })} />)}</> : null}
      <Text style={[styles.sectionTitle, subfolders.length > 0 && styles.filesSectionTitle]}>文件</Text>
      {directDocuments.map((document) => <SelectableRecentRow key={document.id} document={document} selected={selectedDocumentIds.has(document.id)} selectionMode={selectedDocumentIds.size > 0} onLongPress={() => enterSelection(document.id)} onPress={() => selectedDocumentIds.size > 0 ? toggleSelection(document.id) : router.push({ pathname: "/(tabs)/doc-reader", params: { id: document.id } })} />)}
      {directDocuments.length === 0 && subfolders.length === 0 ? <Text style={[styles.emptyFolder, { color: text }]}>此文件夹暂无文件</Text> : null}
    </ScrollView>
    <DocumentDeleteDialog visible={deleteDialogVisible} count={selectedDocumentIds.size} deleteRelatedQuestions={deleteRelatedQuestions} onChangeDeleteRelated={setDeleteRelatedQuestions} onClose={() => setDeleteDialogVisible(false)} onConfirm={deleteDocuments} />
  </View>;

  return <View style={[styles.page, { backgroundColor: bg }]}>
    {selectedDocumentIds.size > 0 ? <DocumentSelectionBar count={selectedDocumentIds.size} onCancel={exitSelection} onDelete={confirmBatchDelete} /> : <View style={styles.header}><BackButton onPress={() => router.back()} /><Text numberOfLines={1} style={[styles.title, { color: text }]}>文档库</Text><View style={styles.actions}><TouchableOpacity accessibilityLabel="搜索文档" onPress={() => setSearchVisible(true)}><Search size={22} color={text} /></TouchableOpacity><FilePicker onFileSelected={handleFileSelected} label="＋" iconOnly isDark={isDark} /></View></View>}
    <View style={styles.content}>
      <View style={styles.folderSection}><Text style={styles.sectionTitle}>文件夹</Text><ScrollView style={styles.sectionList} contentContainerStyle={styles.folderListContent} showsVerticalScrollIndicator={folders.length > 4} nestedScrollEnabled>{folders.map((item) => <FolderRow key={item.name} folder={item} onPress={() => router.push({ pathname: "/(tabs)/documents", params: { folder: item.name } })} />)}{Array.from({ length: folderPlaceholders }, (_, index) => <View key={`folder-placeholder-${index}`} style={styles.folderPlaceholder} />)}</ScrollView></View>
      <View style={styles.recentSection}><Text style={styles.sectionTitle}>最近打开</Text><View style={styles.recentList}>{recentItems.map((document) => <SelectableRecentRow key={document.id} document={document} selected={selectedDocumentIds.has(document.id)} selectionMode={selectedDocumentIds.size > 0} onLongPress={() => enterSelection(document.id)} onPress={() => selectedDocumentIds.size > 0 ? toggleSelection(document.id) : router.push({ pathname: "/(tabs)/doc-reader", params: { id: document.id } })} />)}{Array.from({ length: recentPlaceholders }, (_, index) => <View key={`recent-placeholder-${index}`} style={styles.recentPlaceholder} />)}</View></View>
    </View>
    <ImportMethodSheet file={selectedFile} visible={methodSheetVisible} onSelect={startImport} onClose={() => setMethodSheetVisible(false)} />
    <ImportProgressModal state={importState} longWait={longWait} onRetry={() => { if (importState.status === "failed") startImport(importState.mode); }} onClose={() => { setImportState({ status: "idle" }); setSelectedFile(null); }} onViewQuestions={() => { setImportState({ status: "idle" }); setSelectedFile(null); router.push("/(tabs)/questions"); }} onViewDocument={() => { if (importState.status !== "success") return; const documentId = importState.documentId; setImportState({ status: "idle" }); setSelectedFile(null); router.push({ pathname: "/(tabs)/doc-reader", params: { id: documentId } }); }} />
    <UploadPreviewModal visible={showPreview} previewData={previewData} uploading={false} directoryOptions={folders.map((entry) => entry.name)} onClose={() => { setShowPreview(false); setPreviewData(null); setSelectedFile(null); }} onConfirm={(edits, category) => { const mode: ImportMode = previewData?.generate_questions === false ? "original" : "generate"; setShowPreview(false); saveImport(previewData, mode, edits, category); }} />
    <DocumentDeleteDialog visible={deleteDialogVisible} count={selectedDocumentIds.size} deleteRelatedQuestions={deleteRelatedQuestions} onChangeDeleteRelated={setDeleteRelatedQuestions} onClose={() => setDeleteDialogVisible(false)} onConfirm={deleteDocuments} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 14, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 14 }, title: { flex: 1, color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 30, marginLeft: 3 }, actions: { flexDirection: "row", alignItems: "center", gap: 12 }, action: { color: colors.text, fontSize: 30, lineHeight: 34, fontWeight: "300" },
  content: { flex: 1, minHeight: 0, paddingHorizontal: 20, paddingBottom: 18 }, folderSection: { flex: 1.18, minHeight: 0, overflow: "hidden" }, recentSection: { flex: 1, minHeight: 0, marginTop: 13, overflow: "hidden" }, sectionTitle: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 15, marginBottom: 9 }, sectionList: { flex: 1, minHeight: 0 }, folderListContent: { paddingBottom: 2 },
  folderRow: { minHeight: 68, backgroundColor: colors.surface, borderRadius: 15, padding: 11, flexDirection: "row", alignItems: "center", marginBottom: 6, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, folderPlaceholder: { minHeight: 68, marginBottom: 6 }, folderIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 12 }, folderGlyph: { color: colors.document, fontSize: 22 }, rowText: { flex: 1 }, rowTitle: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 }, meta: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 12, marginTop: 3 }, arrow: { color: colors.textSecondary, fontSize: 29, fontWeight: "300" },
  recentList: { flex: 1, minHeight: 0 }, docRow: { minHeight: 62, backgroundColor: colors.surface, borderRadius: 15, padding: 10, flexDirection: "row", alignItems: "center", marginBottom: 6, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, docRowSelected: { backgroundColor: "#f1f2f4" }, recentPlaceholder: { minHeight: 62, marginBottom: 6 }, typeIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 11 }, typeGlyph: { fontSize: 17, fontWeight: "700" }, more: { color: colors.textSecondary, letterSpacing: 1, fontSize: 14 },
  folderHeader: { paddingTop: 14, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 18 }, folderTitle: { flex: 1, color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 30, marginLeft: 3 }, folderActions: { flexDirection: "row", alignItems: "center", gap: 5 }, folderAction: { width: 38, height: 42, alignItems: "center", justifyContent: "center" }, selectionBar: { height: 76, paddingHorizontal: 20, marginBottom: 8, flexDirection: "row", alignItems: "center" }, cancelSelection: { width: 48, height: 42, justifyContent: "center" }, cancelSelectionText: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 15 }, selectionTitle: { flex: 1, color: colors.text, fontFamily: "MiSans-Medium", fontSize: 17, textAlign: "center" }, selectionDelete: { width: 48, height: 42, alignItems: "flex-end", justifyContent: "center" }, deleteOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }, deleteDialog: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: 24 }, deleteTitle: { color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 20, marginBottom: 18 }, deleteDescription: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 14, lineHeight: 21, marginTop: 8 }, deleteOptionLabel: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 13, marginTop: 20, marginBottom: 8 }, deleteOption: { minHeight: 66, borderRadius: 15, backgroundColor: "#f1f1f3", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", marginBottom: 9 }, deleteOptionSelected: { backgroundColor: "#edf8f0" }, deleteOptionCopy: { flex: 1, paddingRight: 10 }, deleteOptionTitle: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 15 }, deleteOptionHint: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 12, marginTop: 4 }, deleteActions: { flexDirection: "row", gap: 10, marginTop: 11 }, deleteCancel: { flex: 1, minHeight: 48, justifyContent: "center", alignItems: "center" }, deleteCancelText: { color: colors.textSecondary, fontFamily: "MiSans-Medium", fontSize: 16 }, deleteConfirm: { flex: 1, minHeight: 48, justifyContent: "center", alignItems: "center" }, deleteConfirmText: { color: colors.danger, fontFamily: "MiSans-Semibold", fontSize: 16 }, folderActionGlyph: { color: colors.text, fontSize: 30, fontWeight: "300", lineHeight: 32 }, folderMore: { color: colors.text, fontSize: 17, letterSpacing: 1.5 }, folderContent: { paddingHorizontal: 20, paddingBottom: 28 }, filesSectionTitle: { marginTop: 22 }, emptyFolder: { color: colors.textSecondary, fontFamily: "MiSans-Regular", textAlign: "center", fontSize: 15, marginTop: 72 },
  searchHeader: { paddingTop: 14, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }, searchHeaderButton: { width: 34, height: 42, alignItems: "flex-start", justifyContent: "center" }, searchInputWrap: { flex: 1, height: 44, borderRadius: 14, backgroundColor: "#f1f1f3", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }, searchInput: { flex: 1, color: colors.text, fontFamily: "MiSans-Regular", fontSize: 16, paddingVertical: 0 }, clearSearchButton: { width: 22, height: 30, justifyContent: "center", alignItems: "center" }, searchContent: { paddingHorizontal: 20, paddingBottom: 30 }, searchHint: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 14, textAlign: "center", marginTop: 80 }, searchEmpty: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 15, textAlign: "center", marginTop: 80 },
});
