/**
 * Every Sunday at 10:00 in Córdoba (13:00 UTC): asks the site to email the owner
 * next week's turns. The work happens in /api/cron/weekly-agenda; this only
 * triggers it. Needs CRON_SECRET (same value as the site's) in the environment.
 */
const weeklyAgenda = async () => {
  const secret = process.env.CRON_SECRET;
  const base = process.env.URL ?? "https://goodboy.com.ar";
  if (!secret) {
    console.error("weekly-agenda: CRON_SECRET is not set");
    return;
  }
  const res = await fetch(`${base}/api/cron/weekly-agenda`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log("weekly-agenda:", res.status);
};

export default weeklyAgenda;

export const config = { schedule: "0 13 * * 0" };
