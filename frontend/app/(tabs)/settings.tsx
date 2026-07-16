import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch, TextInput, Alert, ActivityIndicator, Modal, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { getDb } from "../../src/data/db";
import { genId } from "../../src/data/utils";
import { API_BASE, setApiAuthToken } from "../../src/services/api";
import { BackButton } from "../../src/components/PrototypeUI";
import { ChevronRight } from "lucide-react-native";

async function apiRequest(path: string, body?: any, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === "dark";
  const c = isDark ? colors.textDark : colors.text;
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;

  // Auth state
  const [token, setToken] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("");

  // Local learning goal
  const [dailyNewTarget, setDailyNewTarget] = useState("10");
  const [goalPickerVisible, setGoalPickerVisible] = useState(false);

  // Restore the current login for both Web and native SQLite.
  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage?.getItem("bagu_sync_token");
        const savedEmail = localStorage?.getItem("bagu_sync_email");
        if (saved) {
          setToken(saved);
          setApiAuthToken(saved);
          setUserEmail(savedEmail || "");
          return;
        }
      } catch {}
      const database = await getDb();
      const savedToken = await database.getFirstAsync("SELECT value FROM app_settings WHERE key = ?", ["auth_token"]);
      const savedEmail = await database.getFirstAsync("SELECT value FROM app_settings WHERE key = ?", ["auth_email"]);
      if (savedToken?.value) {
        setToken(savedToken.value);
        setApiAuthToken(savedToken.value);
        setUserEmail(savedEmail?.value || "");
      }
    })().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const database = await getDb();
      const setting = await database.getFirstAsync("SELECT value FROM app_settings WHERE key = ?", ["daily_new_target"]);
      if (setting?.value) setDailyNewTarget(setting.value);
    })().catch(() => {});
  }, []);

  const saveDailyNewTarget = async () => {
    const target = Math.floor(Number(dailyNewTarget));
    if (!Number.isFinite(target) || target < 1 || target > 200) {
      Alert.alert("请输入 1 到 200 之间的题目数量");
      return;
    }
    const database = await getDb();
    await database.runAsync(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ["daily_new_target", String(target)]
    );
    setDailyNewTarget(String(target));
    Alert.alert("已保存", `每日新题目标：${target} 题`);
  };
  const chooseDailyNewTarget = async (target: number) => {
    const database = await getDb();
    await database.runAsync(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ["daily_new_target", String(target)]
    );
    setDailyNewTarget(String(target));
    setGoalPickerVisible(false);
  };

  const handleAuth = async () => {
    if (!email || !password) { Alert.alert("请输入邮箱和密码"); return; }
    setAuthLoading(true);
    try {
      const data = await apiRequest(`/api/v1/auth/${isRegister ? "register" : "login"}`, { email, password });
      setToken(data.token);
      setApiAuthToken(data.token);
      setUserEmail(data.email);
      setEmail("");
      setPassword("");
      setShowAuth(false);
      try {
        localStorage?.setItem("bagu_sync_token", data.token);
        localStorage?.setItem("bagu_sync_email", data.email);
      } catch {}
      const database = await getDb();
      await database.runAsync(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ["auth_token", data.token]
      );
      await database.runAsync(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ["auth_email", data.email]
      );
      
      Alert.alert(isRegister ? "注册成功" : "登录成功", `欢迎, ${data.email}`);
    } catch (e: any) {
      Alert.alert(isRegister ? "注册失败" : "登录失败", e.message || "请检查后端是否已启动");
    }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    setToken("");
    setApiAuthToken("");
    setUserEmail("");
    setLastSync("");
    try { localStorage?.removeItem("bagu_sync_token"); localStorage?.removeItem("bagu_sync_email"); } catch {}
    getDb().then(async (database) => {
      await database.runAsync("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", ["auth_token", ""]);
      await database.runAsync("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", ["auth_email", ""]);
    }).catch(() => {});
  };

  const handleSync = async () => {
    if (!token) { Alert.alert("请先登录"); return; }
    setSyncing(true);
    try {
      const database = await getDb();
      
      // Push questions
      const allQuestions: any[] = await database.getAllAsync(
        "SELECT id, cat, q, a, source, source_document_id, tags, created_at FROM questions"
      );
      const allProgress: any[] = await database.getAllAsync(
        "SELECT id, question_id, level, correct, incorrect, last_review, next_review, is_starred FROM card_progress"
      );
      const allDocuments: any[] = await database.getAllAsync(
        "SELECT id, title, cat, content, source, tags, scroll_offset, reading_progress, last_read_at, created_at FROM documents"
      );
      const localSettings: any[] = await database.getAllAsync("SELECT key, value FROM app_settings");
      const localStudyRecords: any[] = await database.getAllAsync(
        "SELECT id, date, count, correct, incorrect, new_count FROM study_records"
      );
      const syncedQuestions = allQuestions.map((question) => {
        let tags: string[] = [];
        try {
          const parsed = typeof question.tags === "string" ? JSON.parse(question.tags) : question.tags;
          tags = Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string" && tag.trim()) : [];
        } catch {}
        return { ...question, tags };
      });
      await apiRequest(
        "/api/v1/sync/push",
        { questions: syncedQuestions, progress: allProgress, documents: allDocuments, settings: Object.fromEntries(localSettings.map((item) => [item.key, item.value])), study_records: localStudyRecords },
        token
      );
      
      // Pull
      const data: any = await apiRequest("/api/v1/sync/pull", undefined, token);
      
      // Merge pulled questions into local DB
      let imported = 0;
      for (const q of data.questions) {
        let tags: string[] = [];
        try {
          const parsed = typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags;
          tags = Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string" && tag.trim()) : [];
        } catch {}
        const existing = await database.getFirstAsync(
          "SELECT id FROM questions WHERE id = ?", [q.id]
        );
        if (!existing) {
          await database.runAsync(
            "INSERT OR IGNORE INTO questions (id, user_id, cat, q, a, source, source_document_id, tags, created_at) VALUES (?, 'cloud', ?, ?, ?, ?, ?, ?, ?)",
            [
              q.id,
              q.cat,
              q.q,
              q.a,
              q.source || "",
              q.source_document_id || null,
              JSON.stringify(tags),
              q.created_at || new Date().toISOString(),
            ]
          );
          imported++;
        } else {
          await database.runAsync(
            "UPDATE questions SET cat = ?, q = ?, a = ?, source = ?, source_document_id = ?, tags = ?, created_at = ? WHERE id = ?",
            [
              q.cat,
              q.q,
              q.a,
              q.source || "",
              q.source_document_id || null,
              JSON.stringify(tags),
              q.created_at || new Date().toISOString(),
              q.id,
            ]
          );
        }
      }

      let importedDocuments = 0;
      for (const doc of data.documents ?? []) {
        const existing = await database.getFirstAsync(
          "SELECT id FROM documents WHERE id = ?",
          [doc.id]
        );
        if (!existing) {
          await database.runAsync(
            "INSERT OR IGNORE INTO documents (id, title, cat, content, source, tags, scroll_offset, reading_progress, last_read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [doc.id, doc.title, doc.cat || "导入文档", doc.content || "", doc.source || "", JSON.stringify(doc.tags || []), doc.scroll_offset || 0, doc.reading_progress || 0, doc.last_read_at || null, doc.created_at || new Date().toISOString()]
          );
          importedDocuments++;
        } else {
          await database.runAsync(
            "UPDATE documents SET title = ?, cat = ?, content = ?, source = ?, tags = ?, scroll_offset = ?, reading_progress = ?, last_read_at = ?, created_at = ? WHERE id = ?",
            [doc.title, doc.cat || "导入文档", doc.content || "", doc.source || "", JSON.stringify(doc.tags || []), doc.scroll_offset || 0, doc.reading_progress || 0, doc.last_read_at || null, doc.created_at || new Date().toISOString(), doc.id]
          );
        }
      }

      for (const [key, value] of Object.entries(data.settings ?? {})) {
        await database.runAsync(
          "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          [key, String(value)]
        );
      }

      for (const record of data.study_records ?? []) {
        const existing = await database.getFirstAsync("SELECT id FROM study_records WHERE date = ?", [record.date]);
        if (existing?.id) {
          await database.runAsync(
            "UPDATE study_records SET count = ?, correct = ?, incorrect = ?, new_count = ? WHERE date = ?",
            [record.count ?? 0, record.correct ?? 0, record.incorrect ?? 0, record.new_count ?? 0, record.date]
          );
        } else {
          await database.runAsync(
            "INSERT INTO study_records (id, user_id, date, count, correct, incorrect, new_count) VALUES (?, 'cloud', ?, ?, ?, ?, ?)",
            [record.id || genId(), record.date, record.count ?? 0, record.correct ?? 0, record.incorrect ?? 0, record.new_count ?? 0]
          );
        }
      }

      let mergedProgress = 0;
      for (const progress of data.progress ?? []) {
        const existing = await database.getFirstAsync(
          "SELECT id FROM card_progress WHERE question_id = ?",
          [progress.question_id]
        );
        if (existing?.id) {
          await database.runAsync(
            `UPDATE card_progress
             SET level = ?, correct = ?, incorrect = ?, last_review = ?, next_review = ?, is_starred = ?
             WHERE id = ?`,
            [
              progress.level ?? 0,
              progress.correct ?? 0,
              progress.incorrect ?? 0,
              progress.last_review ?? null,
              progress.next_review ?? null,
              progress.is_starred ? 1 : 0,
              existing.id,
            ]
          );
        } else {
          await database.runAsync(
            `INSERT INTO card_progress (id, user_id, question_id, level, correct, incorrect, last_review, next_review, is_starred)
             VALUES (?, 'cloud', ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, question_id) DO UPDATE SET
               level = excluded.level,
               correct = excluded.correct,
               incorrect = excluded.incorrect,
               last_review = excluded.last_review,
               next_review = excluded.next_review,
               is_starred = excluded.is_starred`,
            [
              progress.id || genId(),
              progress.question_id,
              progress.level ?? 0,
              progress.correct ?? 0,
              progress.incorrect ?? 0,
              progress.last_review ?? null,
              progress.next_review ?? null,
              progress.is_starred ? 1 : 0,
            ]
          );
        }
        mergedProgress++;
      }
      
      setLastSync(new Date().toLocaleString());
      Alert.alert("同步完成", `已上传 ${allQuestions.length} 题 / ${allProgress.length} 条进度 / ${allDocuments.length} 篇文档, 下载 ${imported} 题 / ${mergedProgress} 条进度 / ${importedDocuments} 篇文档`);
    } catch (e: any) {
      Alert.alert("同步失败", e.message || "请检查后端是否已启动");
    }
    setSyncing(false);
  };

  return <View style={[styles.container, { backgroundColor: bg }]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.pageHeader}><BackButton onPress={() => router.back()} /><Text style={[styles.title, { color: c }]}>我的</Text><View style={styles.headerSpacer} /></View>

      <Text style={styles.listSectionTitle}>学习工具</Text>
      <View style={styles.listGroup}>
        <TouchableOpacity style={styles.listRow} onPress={() => router.push({ pathname: "/(tabs)/collection", params: { type: "starred" } })}><Text style={[styles.listLabel, { color: c }]}>收藏夹</Text><ChevronRight size={20} color={colors.textTertiary} /></TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.listRow} onPress={() => router.push({ pathname: "/(tabs)/collection", params: { type: "mistakes" } })}><Text style={[styles.listLabel, { color: c }]}>错题本</Text><ChevronRight size={20} color={colors.textTertiary} /></TouchableOpacity>
      </View>

      <Text style={styles.listSectionTitle}>账号</Text>
      <View style={styles.listGroup}>
        <TouchableOpacity style={styles.listRow} onPress={token ? handleSync : () => setShowAuth(true)} disabled={syncing}><View><Text style={[styles.listLabel, { color: c }]}>{token ? "同步数据" : "登录 / 注册"}</Text>{token && userEmail ? <Text style={styles.rowDetail}>{userEmail}{lastSync ? ` · ${lastSync}` : ""}</Text> : null}</View>{syncing ? <ActivityIndicator color={colors.primary} size="small" /> : <ChevronRight size={20} color={colors.textTertiary} />}</TouchableOpacity>
        {token ? <><View style={styles.divider} /><TouchableOpacity style={styles.listRow} onPress={handleLogout}><Text style={[styles.listLabel, { color: c }]}>退出登录</Text><ChevronRight size={20} color={colors.textTertiary} /></TouchableOpacity></> : null}
      </View>

      <Text style={styles.listSectionTitle}>学习设置</Text>
      <View style={styles.listGroup}>
        <TouchableOpacity style={styles.listRow} onPress={() => setGoalPickerVisible(true)}><Text style={[styles.listLabel, { color: c }]}>每日新题目标</Text><View style={styles.rowValue}><Text style={styles.rowValueText}>{dailyNewTarget}题</Text><ChevronRight size={20} color={colors.textTertiary} /></View></TouchableOpacity>
      </View>

      <Text style={styles.listSectionTitle}>外观</Text>
      <View style={styles.listGroup}>
        <View style={styles.listRow}><Text style={[styles.listLabel, { color: c }]}>深色模式</Text><Switch value={isDark} onValueChange={toggleTheme} trackColor={{ false: "#e6e7eb", true: colors.primaryDark }} thumbColor={isDark ? colors.primary : "#fff"} /></View>
      </View>
      <Text style={styles.version}>八股记忆 v0.1.0</Text>
    </ScrollView>

    <Modal visible={showAuth} transparent animationType="fade" onRequestClose={() => setShowAuth(false)}><View style={styles.modalOverlay}><View style={[styles.modal, { backgroundColor: surface }]}><Text style={[styles.modalTitle, { color: c }]}>{isRegister ? "注册" : "登录"}</Text><TextInput style={[styles.input, { color: c, borderColor: colors.border }]} placeholder="邮箱" placeholderTextColor={colors.textTertiary} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><TextInput style={[styles.input, { color: c, borderColor: colors.border }]} placeholder="密码" placeholderTextColor={colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry /><TouchableOpacity style={styles.authSubmit} onPress={handleAuth} disabled={authLoading}>{authLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.authSubmitText}>{isRegister ? "注册" : "登录"}</Text>}</TouchableOpacity><TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={styles.authLink}><Text style={styles.linkText}>{isRegister ? "已有账号？去登录" : "没有账号？去注册"}</Text></TouchableOpacity><TouchableOpacity onPress={() => { setShowAuth(false); setEmail(""); setPassword(""); }} style={styles.authLink}><Text style={styles.cancelLink}>取消</Text></TouchableOpacity></View></View></Modal>

    <Modal visible={goalPickerVisible} transparent animationType="fade" onRequestClose={() => setGoalPickerVisible(false)}><Pressable style={styles.goalOverlay} onPress={() => setGoalPickerVisible(false)}><Pressable style={[styles.goalSheet, { backgroundColor: surface }]} onPress={() => undefined}><View style={styles.goalHandle} /><Text style={[styles.goalTitle, { color: c }]}>每日新题目标</Text>{[5, 10, 20, 30, 50].map((target) => <TouchableOpacity key={target} style={styles.goalOption} onPress={() => chooseDailyNewTarget(target)}><Text style={[styles.goalOptionText, { color: String(target) === dailyNewTarget ? colors.primary : c }]}>{target}题</Text>{String(target) === dailyNewTarget ? <Text style={styles.goalSelected}>已选</Text> : null}</TouchableOpacity>)}</Pressable></Pressable></Modal>
  </View>;
  /*
  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.pageHeader}><BackButton onPress={() => router.back()} /><Text style={[styles.title, { color: c }]}>我的</Text><View style={styles.headerSpacer} /></View>

      <View style={[styles.card, { backgroundColor: surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>学习工具</Text>
        <TouchableOpacity style={styles.entryRow} onPress={() => router.push({ pathname: "/(tabs)/collection", params: { type: "starred" } })}>
          <Text style={[styles.settingLabel, { color: c }]}>收藏夹</Text>
          <ChevronRight size={21} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.entryRow} onPress={() => router.push({ pathname: "/(tabs)/collection", params: { type: "mistakes" } })}>
          <Text style={[styles.settingLabel, { color: c }]}>错题本</Text>
          <ChevronRight size={21} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Account Section * /}
      <View style={[styles.card, { backgroundColor: surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>帐号</Text>
        {token ? (
          <>
            <Text style={[styles.settingLabel, { color: c }]}>已登录: {userEmail}</Text>
            {lastSync ? (
              <Text style={[styles.settingDesc, { color: colors.textTertiary }]}>上次同步: {lastSync}</Text>
            ) : null}
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSync} disabled={syncing}>
                {syncing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>同步数据</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.danger }]} onPress={handleLogout}>
                <Text style={styles.btnText}>退出登录</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.settingLabel, { color: c }]}>未登录</Text>
            <Text style={[styles.settingDesc, { color: colors.textTertiary }]}>
              登录后可同步数据到服务器
            </Text>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => setShowAuth(true)}>
              <Text style={styles.btnText}>登录 / 注册</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Auth Modal * /}
      {showAuth && (
        <View style={[styles.modalOverlay]}>
          <View style={[styles.modal, { backgroundColor: surface }]}>
            <Text style={[styles.modalTitle, { color: c }]}>{isRegister ? "注册" : "登录"}</Text>
            <TextInput
              style={[styles.input, { color: c, borderColor: colors.border }]}
              placeholder="邮箱"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={[styles.input, { color: c, borderColor: colors.border }]}
              placeholder="密码"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary, width: "100%", marginTop: 8 }]}
              onPress={handleAuth}
              disabled={authLoading}
            >
              {authLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>{isRegister ? "注册" : "登录"}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={{ marginTop: 12 }}>
              <Text style={[styles.linkText, { color: colors.primary }]}>
                {isRegister ? "已有帐号？去登录" : "没有帐号？去注册"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowAuth(false); setEmail(""); setPassword(""); }} style={{ marginTop: 8 }}>
              <Text style={[styles.linkText, { color: colors.textTertiary }]}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Theme Section * /}
      <View style={[styles.card, { backgroundColor: surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>学习设置</Text>
        <Text style={[styles.settingDesc, { color: colors.textTertiary }]}>每日新题目标</Text>
        <View style={styles.goalRow}>
          <TextInput
            style={[styles.goalInput, { color: c, borderColor: colors.border }]}
            value={dailyNewTarget}
            onChangeText={setDailyNewTarget}
            keyboardType="number-pad"
            maxLength={3}
          />
          <Text style={[styles.goalUnit, { color: c }]}>题</Text>
          <TouchableOpacity style={[styles.saveGoalButton, { backgroundColor: colors.primary }]} onPress={saveDailyNewTarget}>
            <Text style={styles.btnText}>保存</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Theme Section * /}
      <View style={[styles.card, { backgroundColor: surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>外观</Text>
        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: c }]}>暗色模式</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.primaryLight, true: colors.primaryDark }}
            thumbColor={isDark ? colors.primary : colors.surface}
          />
        </View>
      </View>

      <Text style={[styles.version, { color: colors.textTertiary }]}>八股记忆 v0.1.0</Text>
    </View>
  );
  */
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageHeader: { flexDirection: "row", alignItems: "center", marginBottom: 18, marginLeft: -7 }, title: { flex: 1, fontFamily: "MiSans-Semibold", fontSize: 24, marginLeft: 3 }, headerSpacer: { width: 42 },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  card: { borderRadius: 12, padding: 20, marginBottom: 12 },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  settingLabel: { fontSize: 16, fontWeight: "500" },
  settingDesc: { fontSize: 12, marginTop: 8, lineHeight: 18 },
  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  goalRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  goalInput: { width: 72, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16, textAlign: "center" },
  goalUnit: { fontSize: 15, marginLeft: 8 },
  saveGoalButton: { marginLeft: "auto", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  btn: { flex: 1, padding: 14, borderRadius: 10, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  version: { fontSize: 12, textAlign: "center", marginTop: 32 },
  // Modal
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", zIndex: 100 },
  modal: { width: "85%", borderRadius: 16, padding: 24, alignItems: "center" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 20 },
  input: { width: "100%", borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 12 },
  linkText: { color: colors.primary, fontSize: 14, fontFamily: "MiSans-Medium" },
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  listSectionTitle: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 13, marginTop: 26, marginBottom: 8 },
  listGroup: { marginHorizontal: 0 },
  listRow: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  listLabel: { fontFamily: "MiSans-Medium", fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 8, backgroundColor: "#efeff3" },
  rowDetail: { color: colors.textTertiary, fontFamily: "MiSans-Regular", fontSize: 12, marginTop: 3 },
  rowValue: { flexDirection: "row", alignItems: "center", gap: 5 },
  rowValueText: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 15 },
  authSubmit: { width: "100%", alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, marginTop: 2 },
  authSubmitText: { color: "#fff", fontFamily: "MiSans-Medium", fontSize: 15 },
  authLink: { marginTop: 14 },
  cancelLink: { color: colors.textTertiary, fontFamily: "MiSans-Regular", fontSize: 14 },
  goalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.2)", justifyContent: "flex-end" },
  goalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 30 },
  goalHandle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "#d5d6db", marginTop: 10, marginBottom: 18 },
  goalTitle: { fontFamily: "MiSans-Medium", fontSize: 18, marginBottom: 10 },
  goalOption: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#efeff3" },
  goalOptionText: { fontFamily: "MiSans-Regular", fontSize: 16 },
  goalSelected: { color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 13 },
});
