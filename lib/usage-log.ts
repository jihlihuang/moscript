import { getDb, syncDbToBlob } from "@/lib/db";

export async function logUsageEvent({
  eventType,
  subject,
  details,
  userId,
}: {
  eventType: string;
  subject?: string | null;
  details?: unknown;
  userId?: string | null;
}) {
  try {
    const db = await getDb();
    db.prepare(`
      INSERT INTO usage_events (event_type, subject, details, user_id)
      VALUES (?, ?, ?, ?)
    `).run(
      eventType,
      subject ?? null,
      details == null ? null : JSON.stringify(details),
      userId ?? null
    );
    await syncDbToBlob();
  } catch (error) {
    console.error("usage event log failed", error);
  }
}
