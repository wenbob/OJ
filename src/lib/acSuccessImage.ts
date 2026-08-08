export const AC_SUCCESS_IMAGE_SRC = "/ac-success.png";
export const AC_SUCCESS_IMAGE_LOAD_TIMEOUT_MS = 5_000;

let ready = false;
let preloadPromise: Promise<boolean> | null = null;

export function preloadAcSuccessImage(): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  if (ready) {
    return Promise.resolve(true);
  }

  if (preloadPromise) {
    return preloadPromise;
  }

  const image = new window.Image();
  let resolvePromise: (value: boolean) => void = () => undefined;
  const currentPromise = new Promise<boolean>((resolve) => {
    resolvePromise = resolve;
  });
  preloadPromise = currentPromise;

  let settled = false;
  let decoding = false;
  const finish = (loaded: boolean) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    image.onload = null;
    image.onerror = null;

    if (loaded) {
      ready = true;
    } else if (preloadPromise === currentPromise) {
      preloadPromise = null;
    }

    resolvePromise(loaded);
  };

  const handleLoad = async () => {
    if (settled || decoding) return;
    decoding = true;

    try {
      if (typeof image.decode === "function") {
        await image.decode();
      }
    } catch {
      finish(false);
      return;
    }
    finish(true);
  };

  const timeoutId = window.setTimeout(() => {
    finish(false);
  }, AC_SUCCESS_IMAGE_LOAD_TIMEOUT_MS);

  image.onload = () => {
    void handleLoad();
  };
  image.onerror = () => {
    finish(false);
  };
  image.decoding = "async";
  image.src = AC_SUCCESS_IMAGE_SRC;

  if (image.complete && image.naturalWidth > 0) {
    void handleLoad();
  }

  return currentPromise;
}
