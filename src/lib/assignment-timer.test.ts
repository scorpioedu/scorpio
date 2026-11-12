import { getTimerExpiryAction } from "./assignment-timer";

describe("getTimerExpiryAction", () => {
  it("does nothing while time remains", () => {
    expect(getTimerExpiryAction(10, false, true)).toBe("none");
  });

  it("does nothing before the timer is initialised", () => {
    expect(getTimerExpiryAction(null, false, false)).toBe("none");
  });

  it("submits when the main timer expires and no work upload is required", () => {
    expect(getTimerExpiryAction(0, false, false)).toBe("submit");
  });

  it("starts the grace period when the main timer expires and work upload is required", () => {
    expect(getTimerExpiryAction(0, false, true)).toBe("start-grace");
  });

  it("submits when the grace period expires instead of restarting it", () => {
    expect(getTimerExpiryAction(0, true, true)).toBe("submit");
  });
});
