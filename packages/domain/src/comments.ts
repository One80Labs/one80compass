/** One line in the GitHub Project Comments field. The user and date are added here so the field stays traceable. */

export function tracedComment(existing: string | null, user: string, date: string, text: string): string {
  const person = user.replace(/\s+/g, " ").trim() || "Unknown";
  const body = text.replace(/\s+/g, " ").trim();
  const line = `One80Compass · ${person} · ${date} · ${body}`;
  const prior = existing?.trim() ?? "";
  return prior ? `${prior}\n${line}` : line;
}
