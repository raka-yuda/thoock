import { describe, expect, it } from "vitest";
import { createHistoryLookupLogKey } from "./request-log-key";

describe("provider request log keys", () => {
  it("keeps a history lookup correlation key inside the database limit", () => {
    const key = createHistoryLookupLogKey(
      "e8600780-2efc-48a3-b3eb-219044065128",
      "72a2b1a8-aa98-11f1-9d66-36af122d866d",
      "a966771a-6773-4ff8-aa29-d03fc2739509",
    );

    expect(key.length).toBeLessThanOrEqual(100);
    expect(key).toContain("72a2b1a8-aa98-11f1-9d66-36af122d866d");
  });
});
