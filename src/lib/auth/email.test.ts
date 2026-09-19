import { describe, expect, it } from "vitest";
import { validateConsumerEmail } from "./email";

describe("consumer email validation", () => {
  it.each(["person@gmail.com", "person@outlook.com", "person@hotmail.com", "person@live.com", "person@msn.com", "person@googlemail.com"])("accepts %s", (email) => {
    expect(validateConsumerEmail(email)).toBe("");
  });

  it.each(["person@example.com", "person@outlook.example", "missing-at-sign"])("rejects %s", (email) => {
    expect(validateConsumerEmail(email)).not.toBe("");
  });
});
