(() => {
  "use strict";

  const NEO_SCRIPT_URL = "https://neo.sakots.net/neo/dist/neo.js";
  const NEO_STYLE_URL = "https://neo.sakots.net/neo/dist/neo.css";
  const STATE_KEY = "__missneoState__";
  const SCRIPT_ID = "missneo-neo-script";
  const NEO_STYLE_ID = "missneo-neo-style";
  const APP_STYLE_ID = "missneo-style";
  const DEFAULT_CANVAS_WIDTH = 400;
  const DEFAULT_CANVAS_HEIGHT = 400;
  const MIN_CANVAS_SIZE = 100;
  const MAX_CANVAS_SIZE = 2000;

  type PaintBBSCallback = (value: string) => unknown;

  interface NeoPainter {
    getPNG(): Blob | null;
  }

  interface NeoButton {
    enable(): void;
  }

  interface NeoApi {
    params: Record<string, Record<string, string | number | boolean>>;
    painter?: NeoPainter;
    submitButton?: NeoButton | null;
    init(): boolean;
    start(): void;
    setStabilizeLevel?(level: number): void;
  }

  interface MissNeoDocument extends Document {
    paintBBSCallback?: PaintBBSCallback;
  }

  interface MissNeoWindow extends Window {
    Neo?: NeoApi;
    ClipboardItem?: typeof ClipboardItem;
    [STATE_KEY]?: MissNeoState;
  }

  interface MissNeoState {
    open(): void;
    close(): void;
  }

  type MessageKind = "info" | "success" | "error";

  const missNeoWindow = window as MissNeoWindow;
  const missNeoDocument = document as MissNeoDocument;
  const existingState = missNeoWindow[STATE_KEY];

  if (existingState) {
    existingState.open();
    return;
  }

  const originalCallback = missNeoDocument.paintBBSCallback;
  const noteTargetAtLaunch = findNoteTarget();
  let isCopying = false;

  addApplicationStyle();
  addNeoStyle();

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

  const subtitle = document.createElement("span");
  subtitle.textContent = `${DEFAULT_CANVAS_WIDTH} × ${DEFAULT_CANVAS_HEIGHT}px`;

  const closeButton = document.createElement("button");
  closeButton.id = "missneo-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "お絵描き画面を閉じる");
  closeButton.textContent = "×";

  const viewport = document.createElement("div");
  viewport.id = "missneo-viewport";

  const sizeForm = document.createElement("form");
  sizeForm.id = "missneo-size-form";

  const sizeTitle = document.createElement("strong");
  sizeTitle.textContent = "描画サイズ";

  const sizeDescription = document.createElement("p");
  sizeDescription.textContent = `${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE}pxの範囲で指定できます。`;

  const sizeFields = document.createElement("div");
  sizeFields.id = "missneo-size-fields";

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

  const startButton = document.createElement("button");
  startButton.id = "missneo-start";
  startButton.type = "submit";
  startButton.textContent = "お絵描きを始める";

  sizeFields.append(
    widthLabel,
    widthInput,
    separator,
    heightLabel,
    heightInput,
  );
  sizeForm.append(sizeTitle, sizeDescription, sizeFields, startButton);

  const loading = document.createElement("div");
  loading.id = "missneo-loading";
  loading.setAttribute("role", "status");
  loading.textContent = "PaintBBS NEO を読み込んでいます…";
  loading.hidden = true;

  const applet = document.createElement("div");
  applet.className = "neo-applet-paintbbs";
  applet.hidden = true;

  const footer = document.createElement("footer");
  footer.id = "missneo-footer";

  const status = document.createElement("span");
  status.id = "missneo-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "描画する画像の横幅と縦幅を入力してください。";

  heading.append(title, subtitle);
  header.append(heading, closeButton);
  viewport.append(sizeForm, loading, applet);
  footer.append(status);
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

  missNeoDocument.paintBBSCallback = (value: string) => {
    if (value === "check") {
      void copyAndPasteDrawing();
      return false;
    }

    return originalCallback?.(value);
  };

  sizeForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const canvasWidth = readCanvasSize(widthInput);
    const canvasHeight = readCanvasSize(heightInput);
    if (canvasWidth === null || canvasHeight === null) {
      sizeForm.reportValidity();
      return;
    }

    startButton.disabled = true;
    widthInput.disabled = true;
    heightInput.disabled = true;
    void startNeo(canvasWidth, canvasHeight);
  });

  async function startNeo(
    canvasWidth: number,
    canvasHeight: number,
  ): Promise<void> {
    const appletWidth = canvasWidth + 100;
    const appletHeight = canvasHeight + 160;
    subtitle.textContent = `${canvasWidth} × ${canvasHeight}px`;
    panel.style.setProperty(
      "--missneo-panel-width",
      `${appletWidth + 32}px`,
    );
    applet.dataset.width = String(appletWidth);
    applet.dataset.height = String(appletHeight);
    sizeForm.hidden = true;
    loading.hidden = false;
    applet.hidden = false;
    setStatus(
      "描き終えたら NEO の「投稿」を押してください。PNG をノートへ渡します。",
      "info",
    );

    try {
      const neo = await loadNeo();
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

      neo.start();
      neo.setStabilizeLevel?.(1);
      loading.remove();
    } catch (error) {
      loading.textContent = messageFromError(error);
      loading.dataset.kind = "error";
      setStatus(
        "読み込みに失敗しました。ネットワーク接続を確認して、ページを再読み込みしてください。",
        "error",
      );
    }
  }

  async function copyAndPasteDrawing(): Promise<void> {
    if (isCopying) {
      return;
    }

    isCopying = true;
    setStatus("PNG をクリップボードへコピーしています…", "info");

    const neo = missNeoWindow.Neo;
    const png = neo?.painter?.getPNG();

    if (!(png instanceof Blob)) {
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

    const noteTarget = resolveNoteTarget(noteTargetAtLaunch);
    state.close();
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

  function loadNeo(): Promise<NeoApi> {
    const currentNeo = missNeoWindow.Neo;
    if (isNeoApi(currentNeo)) {
      return Promise.resolve(currentNeo);
    }

    return new Promise((resolve, reject) => {
      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

      const handleLoad = () => {
        const neo = missNeoWindow.Neo;
        if (isNeoApi(neo)) {
          resolve(neo);
        } else {
          reject(new Error("PaintBBS NEO の API が見つかりません。"));
        }
      };
      const handleError = () => {
        reject(new Error("PaintBBS NEO のスクリプトを読み込めませんでした。"));
      };

      if (!script) {
        script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = NEO_SCRIPT_URL;
        script.charset = "UTF-8";
        document.head.append(script);
      }

      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
    });
  }

  function isNeoApi(value: NeoApi | undefined): value is NeoApi {
    return Boolean(
      value &&
        typeof value.init === "function" &&
        typeof value.start === "function",
    );
  }

  function addNeoStyle(): void {
    if (document.getElementById(NEO_STYLE_ID)) {
      return;
    }

    const link = document.createElement("link");
    link.id = NEO_STYLE_ID;
    link.rel = "stylesheet";
    link.href = NEO_STYLE_URL;
    document.head.append(link);
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

      #missneo-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 54px;
        padding: 8px 10px 8px 18px;
        box-sizing: border-box;
        border-bottom: 1px solid rgb(255 255 255 / 10%);
      }

      #missneo-heading {
        display: flex;
        align-items: baseline;
        gap: 10px;
      }

      #missneo-title {
        font-size: 16px;
      }

      #missneo-heading span {
        color: #9fb0b9;
        font-size: 12px;
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
        overflow: auto;
        overscroll-behavior: contain;
        background: #11181c;
      }

      #missneo-size-form {
        display: grid;
        gap: 18px;
        justify-items: center;
        min-height: 260px;
        padding: 34px 24px;
        box-sizing: border-box;
        background: #182126;
      }

      #missneo-size-form > strong {
        font-size: 18px;
      }

      #missneo-size-form > p {
        margin: -10px 0 0;
        color: #9fb0b9;
        font-size: 12px;
      }

      #missneo-size-fields {
        display: grid;
        grid-template-columns: auto minmax(82px, 120px) auto auto minmax(82px, 120px);
        align-items: center;
        gap: 8px;
      }

      #missneo-size-fields label {
        color: #c7d3d9;
        font-size: 13px;
      }

      #missneo-size-fields input {
        width: 100%;
        padding: 9px 10px;
        box-sizing: border-box;
        border: 1px solid rgb(255 255 255 / 18%);
        border-radius: 8px;
        outline: none;
        background: #10171b;
        color: #edf5f8;
        font: inherit;
        text-align: right;
      }

      #missneo-size-fields input:focus {
        border-color: #8ac900;
        box-shadow: 0 0 0 2px rgb(138 201 0 / 20%);
      }

      #missneo-size-separator {
        color: #82939b;
      }

      #missneo-start {
        min-width: 180px;
        padding: 10px 18px;
        border: 0;
        border-radius: 9px;
        background: #8ac900;
        color: #172000;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      #missneo-start:hover,
      #missneo-start:focus-visible {
        filter: brightness(1.08);
        outline: none;
      }

      #missneo-start:disabled {
        cursor: wait;
        opacity: 0.55;
      }

      #missneo-size-form[hidden],
      #missneo-loading[hidden],
      #missneo-viewport > .neo-applet-paintbbs[hidden] {
        display: none !important;
      }

      #missneo-viewport > .NEO {
        margin: 0 auto !important;
      }

      #missneo-loading {
        display: grid;
        min-height: 180px;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
        color: #c7d3d9;
        text-align: center;
      }

      #missneo-loading[data-kind="error"] {
        color: #ffb4ab;
      }

      #missneo-footer {
        min-height: 48px;
        padding: 11px 16px;
        box-sizing: border-box;
        border-top: 1px solid rgb(255 255 255 / 10%);
        color: #b8c6cd;
        font-size: 12px;
        line-height: 1.45;
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
