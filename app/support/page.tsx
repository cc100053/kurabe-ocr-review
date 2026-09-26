import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Msg = {
  id: number;
  user_id: string;
  sender: "user" | "admin";
  body: string;
  meta: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

async function reply(formData: FormData) {
  "use server";
  const userId = String(formData.get("user_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!userId || !body) return;
  const { error } = await getSupabaseAdmin()
    .from("support_messages")
    .insert({ user_id: userId, sender: "admin", body });
  if (error) throw error;
  revalidatePath("/support");
}

// ponytail: loads the latest 500 messages and groups in JS; paginate when volume grows.
export default async function SupportPage() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const threads = new Map<string, Msg[]>();
  for (const m of (data as Msg[]).reverse()) {
    threads.set(m.user_id, [...(threads.get(m.user_id) ?? []), m]);
  }
  const list = [...threads.entries()]
    .map(([userId, msgs]) => ({ userId, msgs, last: msgs[msgs.length - 1] }))
    // Awaiting reply first, then newest activity.
    .sort((a, b) =>
      a.last.sender !== b.last.sender
        ? a.last.sender === "user" ? -1 : 1
        : b.last.created_at.localeCompare(a.last.created_at),
    );
  const emails = await Promise.all(
    list.map(async (t) => {
      const { data } = await admin.auth.admin.getUserById(t.userId);
      return data.user?.email ?? (data.user?.is_anonymous ? "guest" : "—");
    }),
  );

  return (
    <main>
      <h1>客服</h1>
      <p className="subtitle">
        {list.filter((t) => t.last.sender === "user").length} 個待回覆 · 回覆會喺 app 內顯示(紅點提示)
      </p>
      {list.length === 0 && <div className="empty">未有訊息</div>}
      {list.map((t, i) => {
        const meta = [...t.msgs].reverse().find((m) => m.meta)?.meta;
        return (
          <section key={t.userId} className="card" style={{ display: "block", marginBottom: 16 }}>
            <div className="card-head">
              <span className="product">{emails[i]}</span>
              {t.last.sender === "user" ? (
                <span className="badge warn">待回覆</span>
              ) : (
                <span className="badge ok">{t.last.read_at ? "已讀" : "已回覆"}</span>
              )}
            </div>
            <div className="mono muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>
              {t.userId}
              {meta && ` · ${Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(" · ")}`}
            </div>
            {t.msgs.map((m) => (
              <div
                key={m.id}
                style={{
                  margin: "6px 0",
                  padding: "8px 12px",
                  borderRadius: 8,
                  whiteSpace: "pre-wrap",
                  background: m.sender === "user" ? "#1c2029" : "#16304f",
                  marginLeft: m.sender === "admin" ? 48 : 0,
                }}
              >
                {m.body}
                <div className="muted" style={{ fontSize: 11 }}>
                  {m.sender === "admin" ? "你" : "用戶"} · {new Date(m.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </div>
              </div>
            ))}
            <form action={reply} style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input type="hidden" name="user_id" value={t.userId} />
              <textarea name="body" required rows={2} maxLength={4000} style={{ flex: 1 }} placeholder="回覆(日文)…" />
              <button type="submit">送出</button>
            </form>
          </section>
        );
      })}
    </main>
  );
}
