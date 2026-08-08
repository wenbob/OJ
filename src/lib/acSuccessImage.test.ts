import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeImage {
  static instances: FakeImage[] = [];

  complete = false;
  decoding = "auto";
  decode = vi.fn<() => Promise<void>>(() => Promise.resolve());
  naturalWidth = 1254;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  src = "";

  constructor() {
    FakeImage.instances.push(this);
  }
}

function installFakeWindow() {
  vi.stubGlobal("window", {
    Image: FakeImage,
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
  });
}

describe("AC success image preloading", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeImage.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reuses one direct static request and waits for image decoding", async () => {
    installFakeWindow();
    const {
      AC_SUCCESS_IMAGE_SRC,
      preloadAcSuccessImage,
    } = await import("./acSuccessImage");

    const first = preloadAcSuccessImage();
    const second = preloadAcSuccessImage();
    const image = FakeImage.instances[0];

    expect(first).toBe(second);
    expect(FakeImage.instances).toHaveLength(1);
    expect(image.src).toBe(AC_SUCCESS_IMAGE_SRC);
    expect(image.src).toBe("/ac-success.png");
    expect(image.decoding).toBe("async");

    let finishDecode: (() => void) | undefined;
    image.decode.mockReturnValue(
      new Promise<void>((resolve) => {
        finishDecode = resolve;
      }),
    );
    image.onload?.();

    let settled = false;
    void first.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishDecode?.();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(image.decode).toHaveBeenCalledTimes(1);

    await expect(preloadAcSuccessImage()).resolves.toBe(true);
    expect(FakeImage.instances).toHaveLength(1);
  });

  it("clears a failed request so the next call can retry", async () => {
    installFakeWindow();
    const { preloadAcSuccessImage } = await import("./acSuccessImage");

    const first = preloadAcSuccessImage();
    FakeImage.instances[0].onerror?.();
    await expect(first).resolves.toBe(false);

    const retry = preloadAcSuccessImage();
    expect(FakeImage.instances).toHaveLength(2);
    FakeImage.instances[1].onload?.();
    await expect(retry).resolves.toBe(true);
  });

  it("falls back and allows retry when image decoding fails", async () => {
    installFakeWindow();
    const { preloadAcSuccessImage } = await import("./acSuccessImage");

    const first = preloadAcSuccessImage();
    FakeImage.instances[0].decode.mockRejectedValue(new Error("decode failed"));
    FakeImage.instances[0].onload?.();
    await expect(first).resolves.toBe(false);

    const retry = preloadAcSuccessImage();
    expect(FakeImage.instances).toHaveLength(2);
    FakeImage.instances[1].onload?.();
    await expect(retry).resolves.toBe(true);
  });

  it("stops waiting after the timeout and allows another attempt", async () => {
    installFakeWindow();
    const {
      AC_SUCCESS_IMAGE_LOAD_TIMEOUT_MS,
      preloadAcSuccessImage,
    } = await import("./acSuccessImage");

    const first = preloadAcSuccessImage();
    await vi.advanceTimersByTimeAsync(AC_SUCCESS_IMAGE_LOAD_TIMEOUT_MS);
    await expect(first).resolves.toBe(false);

    const retry = preloadAcSuccessImage();
    expect(FakeImage.instances).toHaveLength(2);
    FakeImage.instances[1].onerror?.();
    await expect(retry).resolves.toBe(false);
  });

  it("is safe when rendered without a browser window", async () => {
    vi.unstubAllGlobals();
    const { preloadAcSuccessImage } = await import("./acSuccessImage");

    await expect(preloadAcSuccessImage()).resolves.toBe(false);
    expect(FakeImage.instances).toHaveLength(0);
  });
});
