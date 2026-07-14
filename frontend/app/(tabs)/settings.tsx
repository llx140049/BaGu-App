import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch, TextInput, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { getDb } from "../../src/data/db";
import { genId } from "../../src/data/utils";
import { API_BASE } from "../../src/services/api";

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

  // On mount, restore saved token
  useEffect(() => {
    try { const saved = localStorage?.getItem("bagu_sync_token"); const savedEmail = localStorage?.getItem("bagu_sync_email"); if (saved) { setToken(saved); setUserEmail(savedEmail || ""); } } catch {}
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

  const handleAuth = async () => {
    if (!email || !password) { Alert.alert("请输入邮箱和密码"); return; }
    setAuthLoading(true);
    try {
      const data = await apiRequest(`/api/v1/auth/${isRegister ? "register" : "login"}`, { email, password });
      setToken(data.token);
      setUserEmail(data.email);
      setEmail("");
      setPassword("");
      setShowAuth(false);
      try {
        localStorage?.setItem("bagu_sync_token", data.token);
        localStorage?.setItem("bagu_sync_email", data.email);
      } catch {}
      
      Alert.alert(isRegister ? "注册成功" : "登录成功", `欢迎, ${data.email}`);
    } catch (e: any) {
      Alert.alert(isRegister ? "注册失败" : "登录失败", e.message || "请检查后端是否已启动");
    }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    setToken("");
    setUserEmail("");
    setLastSync("");
    try { localStorage?.removeItem("bagu_sync_token"); localStorage?.removeItem("bagu_sync_email"); } catch {}
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
      await apiRequest(
        "/api/v1/sync/push",
        { questions: allQuestions, progress: allProgress, documents: allDocuments, settings: Object.fromEntries(localSettings.map((item) => [item.key, item.value])), study_records: localStudyRecords },
        token
      );
      
      // Pull
      const data: any = await apiRequest("/api/v1/sync/pull", undefined, token);
      
      // Merge pulled questions into local DB
      let imported = 0;
      for (const q of data.questions) {
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
              JSON.stringify(q.tags || []),
              q.created_at || new Date().toISOString(),
            ]
          );
          imported++;
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

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: c }]}>我的</Text>

      <View style={[styles.card, { backgroundColor: surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>学习工具</Text>
        <TouchableOpacity style={styles.entryRow} onPress={() => router.push({ pathname: "/(tabs)/collection", params: { type: "starred" } })}>
          <Text style={[styles.settingLabel, { color: c }]}>收藏夹</Text>
          <Text style={[styles.entryArrow, { color: colors.textTertiary }]}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.entryRow} onPress={() => router.push({ pathname: "/(tabs)/collection", params: { type: "mistakes" } })}>
          <Text style={[styles.settingLabel, { color: c }]}>错题本</Text>
          <Text style={[styles.entryArrow, { color: colors.textTertiary }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Account Section */}
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

      {/* Auth Modal */}
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

      {/* Theme Section */}
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

      {/* Theme Section */}
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
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "700", marginTop: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  card: { borderRadius: 12, padding: 20, marginBottom: 12 },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  entryArrow: { fontSize: 28, lineHeight: 28 },
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
  linkText: { fontSize: 14, fontWeight: "500" },
});
