export function trackAchievementEvent(type: "bookmark" | "playlist" | "ai_message" | "chat_message") {
  try {
    fetch("/api/achievements/event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    }).catch(() => {});
  } catch {}
}
