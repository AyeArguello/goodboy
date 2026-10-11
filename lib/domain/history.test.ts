import { describe, expect, it } from "vitest";
import {
  HISTORY_STATUSES,
  historyGroupOf,
  matchesHistoryQuery,
} from "./history";

describe("historyGroupOf", () => {
  it("groups every way a request can end", () => {
    expect(historyGroupOf("cancelled_by_client")).toBe("cancelled");
    expect(historyGroupOf("cancelled_by_business")).toBe("cancelled");
    expect(historyGroupOf("deposit_forfeited")).toBe("cancelled");
    expect(historyGroupOf("expired")).toBe("expired");
    expect(historyGroupOf("completed")).toBe("completed");
    expect(historyGroupOf("no_show")).toBe("no_show");
  });

  it("leaves open requests out of the history", () => {
    for (const status of [
      "pending_review",
      "awaiting_deposit",
      "confirmed",
      "reschedule_requested",
    ] as const) {
      expect(historyGroupOf(status)).toBeNull();
      expect(HISTORY_STATUSES).not.toContain(status);
    }
  });
});

describe("matchesHistoryQuery", () => {
  const appointment = {
    dogName: "Yuli",
    ownerName: "Marta Gómez",
    code: "GB-B7B4R4CV",
    phoneE164: "+5493517614768",
  };

  it("matches dog, owner, code or phone ignoring accents and case", () => {
    expect(matchesHistoryQuery(appointment, "yuli")).toBe(true);
    expect(matchesHistoryQuery(appointment, "gomez")).toBe(true);
    expect(matchesHistoryQuery(appointment, "b7b4")).toBe(true);
    expect(matchesHistoryQuery(appointment, "7614768")).toBe(true);
    expect(matchesHistoryQuery(appointment, "luna")).toBe(false);
  });

  it("matches everything when the search is empty", () => {
    expect(matchesHistoryQuery(appointment, "  ")).toBe(true);
  });
});
