(() => {
  "use strict";

  const NEO_SCRIPT_URL = "https://neo.sakots.net/neo/dist/neo.js";
  const NEO_STYLE_URL = "https://neo.sakots.net/neo/dist/neo.css";
  const STATE_KEY = "__missneoState__";
  const APP_STYLE_ID = "missneo-style";
  const DEFAULT_CANVAS_WIDTH = 400;
  const DEFAULT_CANVAS_HEIGHT = 400;
  const MIN_CANVAS_SIZE = 100;
  const MAX_CANVAS_SIZE = 2000;
  const MISSNEO_VERSION = "__MISSNEO_VERSION__";

  type PaintBBSCallback = (value: string) => unknown;

  interface NeoPainter {
    getPNG(): Blob | null;
    isDirty?(): boolean;
  }

  interface NeoButton {
    enable(): void;
  }

  interface NeoApi {
    params: Record<string, Record<string, string | number | boolean>>;
    painter?: NeoPainter;
    submitButton?: NeoButton | null;
    fullScreen?: boolean;
    init(): boolean;
    start(): void;
    resizeCanvas?(): void;
    setStabilizeLevel?(level: number): void;
    updateWindow?(): void;
  }

  interface NeoFrameDocument extends Document {
    paintBBSCallback?: PaintBBSCallback;
  }

  interface NeoFrameWindow extends Window {
    Neo?: NeoApi;
  }

  interface MissNeoWindow extends Window {
    ClipboardItem?: typeof ClipboardItem;
    [STATE_KEY]?: MissNeoState;
  }

  interface MissNeoState {
    open(): void;
    close(): void;
  }

  type MessageKind = "info" | "success" | "error";

  const missNeoWindow = window as MissNeoWindow;
  const existingState = missNeoWindow[STATE_KEY];

  if (existingState) {
    existingState.open();
    return;
  }

  const noteTargetAtLaunch = findNoteTarget();
  let currentNeo: NeoApi | null = null;
  let currentFrame: HTMLIFrameElement | null = null;
  let currentCanvasWidth = DEFAULT_CANVAS_WIDTH;
  let currentCanvasHeight = DEFAULT_CANVAS_HEIGHT;
  let mountGeneration = 0;
  let isCopying = false;

  addApplicationStyle();

  const overlay = document.createElement("div");
  overlay.id = "missneo-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "missneo-title");

  const panel = document.createElement("div");
  panel.id = "missneo-panel";

  const header = document.createElement("header");
  header.id = "missneo-header";

  const heading = document.createElement("div");
  heading.id = "missneo-heading";

  const title = document.createElement("strong");
  title.id = "missneo-title";
  title.textContent = "PaintBBS NEO";

  const sizeForm = document.createElement("form");
  sizeForm.id = "missneo-size-form";
  sizeForm.setAttribute("aria-label", "描画サイズ");

  const widthLabel = document.createElement("label");
  widthLabel.htmlFor = "missneo-canvas-width";
  widthLabel.textContent = "横";

  const widthInput = createSizeInput(
    "missneo-canvas-width",
    DEFAULT_CANVAS_WIDTH,
  );

  const separator = document.createElement("span");
  separator.id = "missneo-size-separator";
  separator.textContent = "×";
  separator.setAttribute("aria-hidden", "true");

  const heightLabel = document.createElement("label");
  heightLabel.htmlFor = "missneo-canvas-height";
  heightLabel.textContent = "縦";

  const heightInput = createSizeInput(
    "missneo-canvas-height",
    DEFAULT_CANVAS_HEIGHT,
  );

  const resizeButton = document.createElement("button");
  resizeButton.id = "missneo-resize";
  resizeButton.type = "submit";
  resizeButton.textContent = "変更";

  sizeForm.append(
    widthLabel,
    widthInput,
    separator,
    heightLabel,
    heightInput,
    resizeButton,
  );

  const closeButton = document.createElement("button");
  closeButton.id = "missneo-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "お絵描き画面を閉じる");
  closeButton.textContent = "×";

  const viewport = document.createElement("div");
  viewport.id = "missneo-viewport";

  const loading = document.createElement("div");
  loading.id = "missneo-loading";
  loading.setAttribute("role", "status");
  loading.textContent = "PaintBBS NEO を読み込んでいます…";

  const footer = document.createElement("footer");
  footer.id = "missneo-footer";

  const status = document.createElement("span");
  status.id = "missneo-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent =
    "描き終えたら NEO の「投稿」を押してください。PNG をノートへ渡します。";

  const version = document.createElement("span");
  version.id = "missneo-version";
  version.textContent = `missneo v${MISSNEO_VERSION}`;

  heading.append(title, sizeForm);
  header.append(heading, closeButton);
  viewport.append(loading);
  footer.append(status, version);
  panel.append(header, viewport, footer);
  overlay.append(panel);
  document.body.append(overlay);

  const state: MissNeoState = {
    open() {
      overlay.hidden = false;
      document.documentElement.classList.add("missneo-open");
      if (sizeForm.isConnected && !sizeForm.hidden) {
        widthInput.focus({ preventScroll: true });
        widthInput.select();
      } else {
        closeButton.focus({ preventScroll: true });
      }
    },
    close() {
      overlay.hidden = true;
      document.documentElement.classList.remove("missneo-open");
      focusNoteTarget(noteTargetAtLaunch ?? findNoteTarget());
    },
  };

  missNeoWindow[STATE_KEY] = state;
  state.open();

  closeButton.addEventListener("click", state.close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      state.close();
    }
  });
  overlay.addEventListener(
    "dblclick",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      event.preventDefault();
      state.close();
    }
  });
  window.addEventListener("resize", () => {
    if (!currentNeo?.fullScreen) {
      return;
    }
    window.requestAnimationFrame(() => currentNeo?.resizeCanvas?.());
  });

  sizeForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const canvasWidth = readCanvasSize(widthInput);
    const canvasHeight = readCanvasSize(heightInput);
    if (canvasWidth === null || canvasHeight === null) {
      sizeForm.reportValidity();
      return;
    }

    if (
      canvasWidth === currentCanvasWidth &&
      canvasHeight === currentCanvasHeight
    ) {
      return;
    }

    if (
      (currentNeo?.painter?.isDirty?.() ?? false) &&
      !window.confirm(
        "描画サイズを変更すると、現在の描画内容は消去されます。よろしいですか？",
      )
    ) {
      widthInput.value = String(currentCanvasWidth);
      heightInput.value = String(currentCanvasHeight);
      return;
    }

    void mountNeo(canvasWidth, canvasHeight);
  });

  void mountNeo(DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);

  async function mountNeo(
    canvasWidth: number,
    canvasHeight: number,
  ): Promise<void> {
    const generation = ++mountGeneration;
    const appletWidth = canvasWidth + 100;
    const appletHeight = canvasHeight + 160;

    resizeButton.disabled = true;
    currentNeo = null;
    panel.classList.remove("missneo-window-mode");
    currentFrame?.remove();
    currentFrame = null;
    loading.hidden = false;
    loading.dataset.kind = "";
    loading.textContent = "PaintBBS NEO を読み込んでいます…";
    panel.style.setProperty(
      "--missneo-panel-width",
      `${appletWidth + 32}px`,
    );

    try {
      const { frame, neo } = await createNeoFrame(
        canvasWidth,
        canvasHeight,
        appletWidth,
        appletHeight,
      );

      if (generation !== mountGeneration) {
        frame.remove();
        return;
      }

      currentCanvasWidth = canvasWidth;
      currentCanvasHeight = canvasHeight;
      currentFrame = frame;
      currentNeo = neo;
      widthInput.value = String(canvasWidth);
      heightInput.value = String(canvasHeight);
      loading.hidden = true;
      frame.style.visibility = "visible";
      resizeButton.disabled = false;
      setStatus(
        "描き終えたら NEO の「投稿」を押してください。PNG をノートへ渡します。",
        "info",
      );
    } catch (error) {
      if (generation !== mountGeneration) {
        return;
      }

      loading.textContent = messageFromError(error);
      loading.dataset.kind = "error";
      resizeButton.disabled = false;
      setStatus(
        "読み込みに失敗しました。ネットワーク接続を確認して、ページを再読み込みしてください。",
        "error",
      );
    }
  }

  async function createNeoFrame(
    canvasWidth: number,
    canvasHeight: number,
    appletWidth: number,
    appletHeight: number,
  ): Promise<{ frame: HTMLIFrameElement; neo: NeoApi }> {
    const frame = document.createElement("iframe");
    frame.className = "missneo-frame";
    frame.title = `PaintBBS NEO ${canvasWidth} × ${canvasHeight}px`;
    frame.width = String(appletWidth);
    frame.height = String(appletHeight);
    frame.style.visibility = "hidden";
    viewport.append(frame);

    const frameWindow = frame.contentWindow as NeoFrameWindow | null;
    const frameDocument = frame.contentDocument as NeoFrameDocument | null;

    if (!frameWindow || !frameDocument) {
      frame.remove();
      throw new Error("お絵描き画面を作成できませんでした。");
    }

    frameDocument.documentElement.lang = "ja";
    frameDocument.title = frame.title;
    frameDocument.body.style.margin = "0";
    frameDocument.body.style.overflow = "hidden";

    const neoStyle = frameDocument.createElement("link");
    neoStyle.rel = "stylesheet";
    neoStyle.href = NEO_STYLE_URL;

    const applet = frameDocument.createElement("div");
    applet.className = "neo-applet-paintbbs";
    applet.dataset.width = String(appletWidth);
    applet.dataset.height = String(appletHeight);

    const styleLoaded = waitForStylesheet(neoStyle);
    frameDocument.head.append(neoStyle);
    frameDocument.body.append(applet);
    frameDocument.paintBBSCallback = (value: string) => {
      if (value === "check") {
        void copyAndPasteDrawing();
        return false;
      }
      return undefined;
    };
    frameDocument.addEventListener(
      "dblclick",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      { passive: false },
    );
    frameDocument.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        state.close();
      }
    });
    let frameNeo: NeoApi | null = null;
    frameDocument.addEventListener("neo:fullscreenchange", (event) => {
      const fullscreen = Boolean(
        (event as CustomEvent<{ fullscreen?: boolean }>).detail?.fullscreen,
      );
      setNeoWindowMode(frame, frameNeo, fullscreen);
    });

    try {
      const [neo] = await Promise.all([
        loadNeoInFrame(frameDocument, frameWindow),
        styleLoaded,
      ]);
      neo.params = {
        paintbbs: {
          image_width: canvasWidth,
          image_height: canvasHeight,
          neo_show_right_button: true,
          neo_disable_grid_touch_move: true,
          neo_disable_turn_original_glitch: true,
          neo_enable_zoom_out: true,
        },
      };

      if (!neo.init()) {
        throw new Error("PaintBBS NEO の描画領域を初期化できませんでした。");
      }

      frameNeo = neo;
      neo.start();
      neo.setStabilizeLevel?.(1);
      return { frame, neo };
    } catch (error) {
      frame.remove();
      throw error;
    }
  }

  async function copyAndPasteDrawing(): Promise<void> {
    if (isCopying) {
      return;
    }

    isCopying = true;
    setStatus("PNG をクリップボードへコピーしています…", "info");

    const neo = currentNeo;
    leaveNeoWindowView(neo);
    const png = neo?.painter?.getPNG();

    if (!isBlob(png)) {
      setStatus("描画画像を PNG に変換できませんでした。", "error");
      neo?.submitButton?.enable();
      isCopying = false;
      return;
    }

    try {
      await writePngToClipboard(png);
    } catch (error) {
      setStatus(
        `クリップボードへコピーできませんでした: ${messageFromError(error)}`,
        "error",
      );
      showToast(
        "画像をコピーできませんでした。ブラウザのクリップボード権限を確認してください。",
        "error",
      );
      neo?.submitButton?.enable();
      isCopying = false;
      return;
    }

    state.close();
    await nextAnimationFrame();
    const noteTarget = resolveNoteTarget(noteTargetAtLaunch);
    const pasted = noteTarget ? dispatchImagePaste(noteTarget, png) : false;

    if (pasted) {
      showToast("画像をクリップボード経由でノートに貼り付けました。", "success");
    } else {
      focusNoteTarget(noteTarget);
      showToast(
        "画像をコピーしました。ノート欄で Ctrl+V（Mac は ⌘V）を押してください。",
        "success",
        7000,
      );
    }

    neo?.submitButton?.enable();
    isCopying = false;
  }

  function leaveNeoWindowView(neo: NeoApi | null): void {
    if (!neo?.fullScreen) {
      return;
    }

    neo.fullScreen = false;
    neo.updateWindow?.();
  }

  function setNeoWindowMode(
    frame: HTMLIFrameElement,
    neo: NeoApi | null,
    fullscreen: boolean,
  ): void {
    panel.classList.toggle("missneo-window-mode", fullscreen);
    frame.classList.toggle("missneo-frame-window", fullscreen);

    window.requestAnimationFrame(() => {
      if (frame.isConnected) {
        neo?.resizeCanvas?.();
      }
    });
  }

  function nextAnimationFrame(): Promise<void> {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  function writePngToClipboard(png: Blob): Promise<void> {
    const ClipboardItemConstructor =
      missNeoWindow.ClipboardItem ?? globalThis.ClipboardItem;

    if (
      !window.isSecureContext ||
      !navigator.clipboard?.write ||
      !ClipboardItemConstructor
    ) {
      throw new Error(
        "このブラウザまたは接続では画像クリップボードを利用できません。",
      );
    }

    const item = new ClipboardItemConstructor({ "image/png": png });
    return navigator.clipboard.write([item]);
  }

  function dispatchImagePaste(target: HTMLElement, png: Blob): boolean {
    try {
      const transfer = new DataTransfer();
      const file = new File([png], createFileName(), {
        type: "image/png",
        lastModified: Date.now(),
      });
      transfer.items.add(file);

      focusNoteTarget(target);
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: transfer,
      });

      target.dispatchEvent(pasteEvent);
      return pasteEvent.defaultPrevented;
    } catch {
      return false;
    }
  }

  function resolveNoteTarget(
    preferredTarget: HTMLElement | null,
  ): HTMLElement | null {
    if (preferredTarget?.isConnected && isVisible(preferredTarget)) {
      return preferredTarget;
    }
    return findNoteTarget();
  }

  function findNoteTarget(): HTMLElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement && isEditable(active) && isVisible(active)) {
      return active;
    }

    const misskeyPostForm = document.querySelector<HTMLElement>(
      'textarea[data-testid="post-form-text"]',
    );
    if (misskeyPostForm && isVisible(misskeyPostForm)) {
      return misskeyPostForm;
    }

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'textarea:not([disabled]):not([readonly]), [contenteditable="true"], [role="textbox"]',
      ),
    ).filter((element) => isEditable(element) && isVisible(element));

    candidates.sort((left, right) => scoreNoteTarget(right) - scoreNoteTarget(left));
    return candidates[0] ?? null;
  }

  function scoreNoteTarget(element: HTMLElement): number {
    let score = 0;
    const hint = [
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("data-placeholder"),
    ]
      .filter(Boolean)
      .join(" ");

    if (element.closest('[role="dialog"], dialog')) score += 100;
    if (element.matches('[data-testid="post-form-text"]')) score += 300;
    if (element instanceof HTMLTextAreaElement) score += 50;
    if (/お考え|ノート|note|mind|投稿|post/i.test(hint)) score += 80;

    const rect = element.getBoundingClientRect();
    score += Math.min((rect.width * rect.height) / 1000, 50);
    return score;
  }

  function isEditable(element: HTMLElement): boolean {
    return (
      element instanceof HTMLTextAreaElement ||
      element.isContentEditable ||
      element.getAttribute("role") === "textbox"
    );
  }

  function isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function focusNoteTarget(target: HTMLElement | null): void {
    if (!target?.isConnected) {
      return;
    }
    target.focus({ preventScroll: true });
  }

  function createSizeInput(
    id: string,
    defaultValue: number,
  ): HTMLInputElement {
    const input = document.createElement("input");
    input.id = id;
    input.type = "number";
    input.inputMode = "numeric";
    input.min = String(MIN_CANVAS_SIZE);
    input.max = String(MAX_CANVAS_SIZE);
    input.step = "1";
    input.required = true;
    input.value = String(defaultValue);
    return input;
  }

  function readCanvasSize(input: HTMLInputElement): number | null {
    const value = input.valueAsNumber;
    const isValid =
      Number.isInteger(value) &&
      value >= MIN_CANVAS_SIZE &&
      value <= MAX_CANVAS_SIZE;
    input.setCustomValidity(
      isValid
        ? ""
        : `${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE}の整数を入力してください。`,
    );
    return isValid ? value : null;
  }

  function createFileName(): string {
    const now = new Date();
    const twoDigits = (value: number) => String(value).padStart(2, "0");
    return [
      "missneo-",
      now.getFullYear(),
      twoDigits(now.getMonth() + 1),
      twoDigits(now.getDate()),
      "-",
      twoDigits(now.getHours()),
      twoDigits(now.getMinutes()),
      twoDigits(now.getSeconds()),
      ".png",
    ].join("");
  }

  function loadNeoInFrame(
    frameDocument: NeoFrameDocument,
    frameWindow: NeoFrameWindow,
  ): Promise<NeoApi> {
    return new Promise((resolve, reject) => {
      const handleLoad = () => {
        const neo = frameWindow.Neo;
        if (isNeoApi(neo)) {
          resolve(neo);
        } else {
          reject(new Error("PaintBBS NEO の API が見つかりません。"));
        }
      };
      const handleError = () => {
        reject(new Error("PaintBBS NEO のスクリプトを読み込めませんでした。"));
      };

      const script = frameDocument.createElement("script");
      script.src = NEO_SCRIPT_URL;
      script.charset = "UTF-8";
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
      frameDocument.head.append(script);
    });
  }

  function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
    return new Promise((resolve, reject) => {
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener(
        "error",
        () =>
          reject(
            new Error("PaintBBS NEO のスタイルを読み込めませんでした。"),
          ),
        { once: true },
      );
    });
  }

  function isNeoApi(value: NeoApi | undefined): value is NeoApi {
    return Boolean(
      value &&
        typeof value.init === "function" &&
        typeof value.start === "function",
    );
  }

  function isBlob(value: Blob | null | undefined): value is Blob {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.arrayBuffer === "function" &&
        value.type === "image/png",
    );
  }

  function addApplicationStyle(): void {
    if (document.getElementById(APP_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = APP_STYLE_ID;
    style.textContent = `
      html.missneo-open,
      html.missneo-open body {
        overflow: hidden !important;
      }

      #missneo-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: grid;
        place-items: center;
        padding: 12px;
        box-sizing: border-box;
        background: rgb(8 12 16 / 76%);
        color: #e8eef2;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #missneo-overlay[hidden] {
        display: none;
      }

      #missneo-panel {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        width: min(100%, var(--missneo-panel-width, 520px));
        max-height: calc(100dvh - 24px);
        overflow: hidden;
        border: 1px solid rgb(255 255 255 / 14%);
        border-radius: 16px;
        background: #202a2f;
        box-shadow: 0 24px 80px rgb(0 0 0 / 45%);
      }

      #missneo-panel.missneo-window-mode {
        width: 100%;
        height: calc(100dvh - 24px);
      }

      #missneo-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 54px;
        padding: 8px 10px 8px 18px;
        box-sizing: border-box;
        border-bottom: 1px solid rgb(255 255 255 / 10%);
      }

      #missneo-heading {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        min-width: 0;
      }

      #missneo-title {
        font-size: 16px;
      }

      #missneo-close {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #dce7ec;
        font: 30px/1 sans-serif;
        cursor: pointer;
      }

      #missneo-close:hover,
      #missneo-close:focus-visible {
        background: rgb(255 255 255 / 10%);
        outline: none;
      }

      #missneo-viewport {
        position: relative;
        min-height: 180px;
        overflow: auto;
        overscroll-behavior: contain;
        background: #11181c;
      }

      #missneo-size-form {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      #missneo-size-form label {
        color: #9fb0b9;
        font-size: 11px;
      }

      #missneo-size-form input {
        width: 72px;
        padding: 6px 7px;
        box-sizing: border-box;
        border: 1px solid rgb(255 255 255 / 18%);
        border-radius: 7px;
        outline: none;
        background: #10171b;
        color: #edf5f8;
        font: inherit;
        font-size: 13px;
        text-align: right;
      }

      #missneo-size-form input:focus {
        border-color: #8ac900;
        box-shadow: 0 0 0 2px rgb(138 201 0 / 20%);
      }

      #missneo-size-separator {
        color: #82939b;
        font-size: 12px;
      }

      #missneo-resize {
        padding: 6px 10px;
        border: 0;
        border-radius: 7px;
        background: #8ac900;
        color: #172000;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      #missneo-resize:hover,
      #missneo-resize:focus-visible {
        filter: brightness(1.08);
        outline: none;
      }

      #missneo-resize:disabled {
        cursor: wait;
        opacity: 0.55;
      }

      #missneo-loading[hidden] {
        display: none !important;
      }

      #missneo-viewport > .missneo-frame {
        display: block;
        margin: 0 auto !important;
        border: 0;
        background: #11181c;
      }

      #missneo-panel.missneo-window-mode #missneo-viewport {
        overflow: hidden;
      }

      #missneo-viewport > .missneo-frame-window {
        width: 100% !important;
        height: 100% !important;
      }

      #missneo-loading {
        display: grid;
        position: absolute;
        inset: 0;
        z-index: 1;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
        background: #11181c;
        color: #c7d3d9;
        text-align: center;
      }

      #missneo-loading[data-kind="error"] {
        color: #ffb4ab;
      }

      #missneo-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        padding: 11px 16px;
        box-sizing: border-box;
        border-top: 1px solid rgb(255 255 255 / 10%);
        color: #b8c6cd;
        font-size: 12px;
        line-height: 1.45;
      }

      #missneo-version {
        flex: 0 0 auto;
        color: #82939b;
        font-size: 11px;
        white-space: nowrap;
      }

      #missneo-status[data-kind="success"] {
        color: #93e7b0;
      }

      #missneo-status[data-kind="error"] {
        color: #ffb4ab;
      }

      .missneo-toast {
        position: fixed;
        left: 50%;
        bottom: max(20px, env(safe-area-inset-bottom));
        z-index: 2147483647;
        width: max-content;
        max-width: min(90vw, 560px);
        transform: translateX(-50%);
        padding: 12px 16px;
        border: 1px solid rgb(255 255 255 / 14%);
        border-radius: 12px;
        background: #202a2f;
        box-shadow: 0 12px 40px rgb(0 0 0 / 35%);
        color: #edf5f8;
        font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
      }

      .missneo-toast[data-kind="error"] {
        border-color: rgb(255 120 110 / 45%);
      }

      @media (max-width: 520px) {
        #missneo-overlay {
          padding: 0;
        }

        #missneo-panel {
          width: 100%;
          max-height: 100dvh;
          border: 0;
          border-radius: 0;
        }

        #missneo-panel.missneo-window-mode {
          height: 100dvh;
        }

        #missneo-header {
          align-items: flex-start;
        }

        #missneo-heading {
          gap: 7px 10px;
        }

        #missneo-title {
          width: 100%;
        }

        #missneo-size-form input {
          width: 62px;
        }
      }
    `;
    document.head.append(style);
  }

  function setStatus(message: string, kind: MessageKind): void {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function showToast(
    message: string,
    kind: MessageKind,
    duration = 4500,
  ): void {
    document.querySelectorAll(".missneo-toast").forEach((toast) => toast.remove());
    const toast = document.createElement("div");
    toast.className = "missneo-toast";
    toast.dataset.kind = kind;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), duration);
  }

  function messageFromError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
})();
