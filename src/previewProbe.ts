// Зонд превью: даёт AI-кодеру ГЛАЗА на работающее приложение.
//
// Живёт ВНУТРИ iframe с игрой, потому что иначе никак: превью грузится с домена бандлера, и
// родительская страница (дашборд) по правилам браузера в его DOM залезть не может — единственная
// щель между ними это postMessage. Зонд эту щель и обслуживает: сериализует DOM в компактное
// дерево, копит console/сеть и умеет кликать по элементам, найденным в прошлом readPage.
//
// Отдельный слой — АВТОМАТИЧЕСКОЕ наблюдение за отрисованной игрой (см. ниже): полотна, кадры,
// three.js, цвет экрана. Он работает без всякого участия игры и именно поэтому нужен: контракт
// `exposeToAgent` даёт больше, но его кто-то должен написать, а произвольной игре не напишет никто.
//
// ДВА ИНВАРИАНТА, которые нельзя нарушать:
//
//   1. Зонд молчит, пока с ним не поздоровались с РАЗРЕШЁННОГО origin. Публичный сайт
//      idosgames.com тоже встраивает игры в iframe — там hello никто не пришлёт, и весь этот код
//      останется мёртвым. Ответ всегда уходит на event.origin, никогда на "*".
//   2. Детект среды — только рантаймовый (адрес страницы, метка превью): зонд копируется в любой
//      проект, и зависеть от того, что проект передаёт при сборке, ему нельзя.
//
// Подключается ПЕРВОЙ строкой main.tsx: тогда перехват console/ошибок стоит раньше, чем всё
// остальное успевает упасть, и агент увидит причину падения старта, а не пустоту.

/** Метка протокола: всё, что без неё, зонда не касается. */
const WIRE = "idos-preview-probe/1";

/** Кто имеет право разговаривать с зондом. Всё остальное игнорируется молча. */
const ALLOWED_ORIGIN_HOSTS = ["platform.idosgames.com"];

/** Сколько записей console храним. Ring buffer: старое вытесняется. */
const CONSOLE_LIMIT = 100;

/** Сколько сетевых вызовов храним. */
const NETWORK_LIMIT = 50;

/** Потолок дерева: узлов, глубины и символов. Держит снапшот в разумных токенах. */
const MAX_NODES = 400;
const MAX_DEPTH = 15;
const MAX_TREE_CHARS = 8000;

/** Обрезка текста узла — модели хватает начала, а полный текст раздувает снапшот. */
const MAX_TEXT = 80;

/** Однотипных детей печатаем не больше этого, остальные схлопываем в «… +N more». */
const MAX_SIBLINGS = 12;

/** Пауза после клика/ввода перед новым снимком: даём React дорисовать. */
const SETTLE_MS = 350;

/** Кольцо отметок кадров — по нему считается fps. Хватает на несколько секунд при 60 fps. */
const FRAME_RING = 240;

/** Сетка чтения пикселей: 6×6 = 36 точек. Каждая точка — отдельный синхронный readPixels. */
const PIXEL_GRID = 6;

/** Сколько ждём кадр перед чтением пикселей. Не дождались — это и есть ответ: петля не идёт. */
const FRAME_WAIT_MS = 200;

/** Потолок удержания синтетической клавиши: агент не должен уметь «зажать W» на минуту. */
const MAX_INPUT_HOLD_MS = 3000;

type ProbeRequest = {
  wire: typeof WIRE;
  id: string;
  cmd: string;
  args?: Record<string, unknown>;
};

type ConsoleEntry = { level: string; text: string; at: number };
type NetworkEntry = {
  method: string;
  url: string;
  status: number | string;
  ms: number;
  at: number;
};

export type PreviewProbeOptions = {
  /** Тайтл, против которого работает приложение — агенту важно видеть DEV это или PROD. */
  titleId?: string;
};

/**
 * Debug-поверхности модулей (см. `ctx.exposeToAgent` в @idosgames/module-sdk). Их выкладывает в
 * глобал host-shell; для отрисованных игр это ЕДИНСТВЕННЫЙ способ что-то узнать — у Three/Phaser
 * весь интерфейс это один `<canvas>`, и дерево DOM про него не расскажет ничего.
 */
type AgentModuleApi = {
  state?: () => unknown;
  actions?: Record<
    string,
    (args?: Record<string, unknown>) => unknown | Promise<unknown>
  >;
  describeActions?: Record<string, string>;
};

/** Состояние платформы, которое выкладывает host-shell (см. `publishHostState` в app-shell). */
type AgentHostState = {
  screen?: string;
  loggedIn?: boolean;
  userId?: string | null;
  titleId?: string | null;
  modules?: string[];
  /** Кто рисует общий интерфейс: роль → id модуля или null (роль свободна, шаблоны рисуют своё). */
  sharedUi?: Record<string, string | null>;
};

type AgentGlobal = {
  version?: number;
  modules?: Record<string, AgentModuleApi>;
  host?: AgentHostState;
  /** Журнал шины событий между модулями (последние события, кто что слушает, расхождения версий). */
  events?: () => unknown;
};

function agentGlobal(): AgentGlobal | undefined {
  return (globalThis as typeof globalThis & { __IDOS_AGENT__?: AgentGlobal })
    .__IDOS_AGENT__;
}

function agentModules(): Record<string, AgentModuleApi> {
  return agentGlobal()?.modules ?? {};
}

const consoleLog: ConsoleEntry[] = [];
const networkLog: NetworkEntry[] = [];

/** Элементы последнего снимка: клик адресуется по ref_N отсюда. */
let refs = new Map<string, Element>();

let installed = false;
let probeOptions: PreviewProbeOptions = {};

/* ------------------------------------------------------------------ утилиты */

function push<T>(buf: T[], entry: T, limit: number): void {
  buf.push(entry);
  if (buf.length > limit) buf.shift();
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Безопасная печать аргумента console: объекты в JSON, циклы и геттеры-бомбы не роняют зонд. */
function stringifyArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isAllowedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      return true;
    return ALLOWED_ORIGIN_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------- сбор console/сети */

function captureConsole(): void {
  const levels = ["log", "info", "warn", "error", "debug"] as const;
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      push(
        consoleLog,
        {
          level,
          text: clip(args.map(stringifyArg).join(" "), 300),
          at: Date.now(),
        },
        CONSOLE_LIMIT,
      );
      original(...args);
    };
  }

  window.addEventListener("error", (event) => {
    const where = event.filename
      ? ` (${event.filename}:${event.lineno}:${event.colno})`
      : "";
    push(
      consoleLog,
      {
        level: "error",
        text: clip(`Uncaught ${event.message}${where}`, 300),
        at: Date.now(),
      },
      CONSOLE_LIMIT,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    push(
      consoleLog,
      {
        level: "error",
        text: clip(`Unhandled rejection: ${stringifyArg(event.reason)}`, 300),
        at: Date.now(),
      },
      CONSOLE_LIMIT,
    );
  });
}

function captureNetwork(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const started = Date.now();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (
      init?.method ??
      (typeof input === "object" && "method" in input ? input.method : "GET") ??
      "GET"
    ).toUpperCase();

    // Заголовки и тела НЕ пишем сознательно: в них сидит Bearer-тикет игрока, а лог уезжает в LLM.
    try {
      const response = await originalFetch(input, init);
      push(
        networkLog,
        {
          method,
          url: clip(url, 200),
          status: response.status,
          ms: Date.now() - started,
          at: started,
        },
        NETWORK_LIMIT,
      );
      return response;
    } catch (error: unknown) {
      push(
        networkLog,
        {
          method,
          url: clip(url, 200),
          status: `failed: ${stringifyArg(error)}`,
          ms: Date.now() - started,
          at: started,
        },
        NETWORK_LIMIT,
      );
      throw error;
    }
  };
}

/* ------------------------------------------ автоматический слой наблюдения */

// Всё, что ниже, работает БЕЗ какой-либо кооперации со стороны игры — в этом весь смысл.
// Контракт `exposeToAgent` даёт данные лучше, но его должен кто-то НАПИСАТЬ, а произвольной (и тем
// более будущей) игре его не напишет никто. Поэтому зонд снимает сам всё, что можно снять с движка
// и с полотна: есть ли WebGL-контекст, идут ли кадры, сколько draw-вызовов, что говорит three.js о
// сцене и камере, и не залит ли кадр одним цветом.
//
// Скриншотов здесь нет и не будет (решение владельца): наружу уходят ТОЛЬКО числа. Зато число
// «все 36 проб одного цвета #ffffff» ловит белый экран не хуже картинки.

/** Настоящий rAF, снятый ДО перехвата: им зонд ждёт кадр, не накручивая собственный счётчик. */
const rawRaf: ((cb: FrameRequestCallback) => number) | null =
  typeof window !== "undefined" &&
  typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : null;

type CanvasRecord = {
  canvas: HTMLCanvasElement;
  /** Как контекст запрашивали: "2d" | "webgl" | "webgl2" | "webgpu" | … */
  kind: string;
  gl: WebGLRenderingContext | WebGL2RenderingContext | null;
  ctx2d: CanvasRenderingContext2D | null;
  /** Отметки «кадр отрисован» (clear/clearRect) — по ним считается настоящий fps. */
  frames: number;
  /** Вызовы отрисовки: у Three/Phaser их десятки-сотни за кадр. */
  draws: number;
  lastDrawAt: number;
};

/** Сколько полотен помним. Больше игре и не нужно, а временные canvas'ы иначе растут без конца. */
const MAX_CANVAS_RECORDS = 24;

const canvasRecords: CanvasRecord[] = [];

/** Отметки кадров: по полотну (надёжнее) и по rAF (петля жива, даже если ничего не рисуется). */
const glFrameTimes: number[] = [];
const rafFrameTimes: number[] = [];

function markFrame(ring: number[]): void {
  ring.push(Date.now());
  if (ring.length > FRAME_RING) ring.shift();
}

/** Сколько отметок пришлось на последнюю секунду. Это и есть fps — без усреднения по сессии. */
function perSecond(ring: number[]): number {
  const cutoff = Date.now() - 1000;
  let count = 0;
  for (let i = ring.length - 1; i >= 0; i--) {
    if ((ring[i] ?? 0) < cutoff) break;
    count++;
  }
  return count;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Подменить метод объекта счётчиком. Пишем в САМ объект, а не в прототип: у WebGL-контекста метод
 * лежит на прототипе, и собственное свойство просто перекрывает его для этого экземпляра — чужие
 * контексты (и чужие вкладки) остаются нетронутыми.
 */
function countCalls(target: unknown, name: string, tick: () => void): void {
  const holder = target as Record<string, unknown> | null;
  if (!holder) return;
  const current = holder[name];
  if (typeof current !== "function") return;
  const original = current as (...args: unknown[]) => unknown;
  holder[name] = function (this: unknown, ...args: unknown[]): unknown {
    try {
      tick();
    } catch {
      /* счётчик не имеет права ломать отрисовку */
    }
    return original.apply(this, args);
  };
}

/** Инструментовка полотна: кадры отдельно, вызовы отрисовки отдельно. */
function instrument(rec: CanvasRecord): void {
  const frame = (): void => {
    rec.frames++;
    rec.lastDrawAt = Date.now();
    // В общий счётчик fps идут только полотна НА СТРАНИЦЕ: временные canvas'ы, на которых движки
    // рисуют текстуры и текст, чистятся так же часто и накрутили бы «кадры» на пустом месте.
    if (rec.canvas.isConnected) markFrame(glFrameTimes);
  };
  const draw = (): void => {
    rec.draws++;
  };

  if (rec.gl) {
    // clear зовут один раз за кадр практически все движки — он и служит границей кадра.
    countCalls(rec.gl, "clear", frame);
    for (const method of [
      "drawArrays",
      "drawElements",
      "drawArraysInstanced",
      "drawElementsInstanced",
    ]) {
      countCalls(rec.gl, method, draw);
    }
    return;
  }

  if (rec.ctx2d) {
    countCalls(rec.ctx2d, "clearRect", frame);
    for (const method of [
      "drawImage",
      "fillRect",
      "fill",
      "stroke",
      "fillText",
    ]) {
      countCalls(rec.ctx2d, method, draw);
    }
  }
}

function registerContext(
  canvas: HTMLCanvasElement,
  kind: string,
  ctx: unknown,
): void {
  // Повторный getContext возвращает тот же объект — второй раз инструментовать нельзя.
  if (canvasRecords.some((rec) => rec.canvas === canvas && rec.kind === kind))
    return;

  // Потолок списка обязателен: движки создают временные полотна пачками (текстуры из текста,
  // атласы), и без него зонд держал бы ссылку на каждое — утечка памяти плюс линейный поиск,
  // который растёт с каждым кадром. Первыми уходят полотна, которых уже нет на странице.
  if (canvasRecords.length >= MAX_CANVAS_RECORDS) {
    for (let i = canvasRecords.length - 1; i >= 0; i--) {
      if (!canvasRecords[i]?.canvas.isConnected) canvasRecords.splice(i, 1);
    }
    while (canvasRecords.length >= MAX_CANVAS_RECORDS) canvasRecords.shift();
  }

  const isGl =
    kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl";
  const rec: CanvasRecord = {
    canvas,
    kind,
    gl: isGl ? (ctx as WebGLRenderingContext | WebGL2RenderingContext) : null,
    ctx2d: kind === "2d" ? (ctx as CanvasRenderingContext2D) : null,
    frames: 0,
    draws: 0,
    lastDrawAt: 0,
  };
  canvasRecords.push(rec);
  instrument(rec);
}

/**
 * Перехват `getContext`. Ставится ДО импорта движка (зонд — первый импорт main.tsx), поэтому ни
 * одно полотно мимо не проходит, чем бы игра ни рисовала: Three, Phaser, Pixi, сырой WebGL, 2d.
 *
 * Заодно ТОЛЬКО В ПРЕВЬЮ навязывается `preserveDrawingBuffer: true`. По умолчанию содержимое
 * WebGL-буфера действительно лишь до композитинга кадра, и снаружи кадра оттуда читается пустота —
 * то есть статичная сцена, которая рисуется один раз, выглядела бы «чёрным экраном». С флагом
 * последний нарисованный кадр остаётся читаемым в любой момент. Цена — небольшая потеря
 * производительности, и платит её только вкладка с превью: в собранной игре зонда нет.
 */
function captureCanvases(): void {
  type GetContext = (
    this: HTMLCanvasElement,
    id: string,
    options?: unknown,
  ) => unknown;

  const proto = HTMLCanvasElement.prototype;
  const original = proto.getContext as unknown as GetContext;

  const patched: GetContext = function (this: HTMLCanvasElement, id, options) {
    let effective = options;
    try {
      const kind = String(id);
      if (
        kind === "webgl" ||
        kind === "webgl2" ||
        kind === "experimental-webgl"
      ) {
        // Копия, а не правка чужого объекта: игра могла передать свой конфиг и переиспользовать его.
        effective = {
          ...(asRecord(options) ?? {}),
          preserveDrawingBuffer: true,
        };
      }
    } catch {
      effective = options;
    }

    const ctx = original.call(this, id, effective);
    try {
      if (ctx) registerContext(this, String(id), ctx);
    } catch {
      /* наблюдение не имеет права мешать игре получить контекст */
    }
    return ctx;
  };

  proto.getContext = patched as unknown as typeof proto.getContext;
}

/** Перехват rAF: показывает, что цикл приложения вообще крутится, даже если полотна нет. */
function captureFrames(): void {
  if (!rawRaf) return;
  window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    rawRaf((time) => {
      markFrame(rafFrameTimes);
      callback(time);
    });
}

/* ---------------------------------------------------------------- three.js */

const three: {
  renderer: Record<string, unknown> | null;
  scene: Record<string, unknown> | null;
  camera: Record<string, unknown> | null;
  scenes: number;
} = { renderer: null, scene: null, camera: null, scenes: 0 };

/**
 * Канал, по которому three.js сам представляется наблюдателю.
 *
 * `WebGLRenderer` и `Scene` в своих конструкторах проверяют глобал `__THREE_DEVTOOLS__` и, если он
 * есть, шлют в него событие `observe` со ссылкой на себя. Задуман он для расширения-девтулзов, но
 * это ровно то, что нужно здесь: никакой правки игры, а на выходе живой рендерер со счётчиками.
 * Глобал обязан существовать ДО создания рендерера — отсюда установка при импорте зонда.
 */
function captureThree(): void {
  const holder = globalThis as typeof globalThis & {
    __THREE_DEVTOOLS__?: EventTarget;
  };

  // Если глобал уже кто-то поставил (расширение three-devtools) — подписываемся, а не затираем.
  const target: EventTarget = holder.__THREE_DEVTOOLS__ ?? new EventTarget();
  holder.__THREE_DEVTOOLS__ = target;

  target.addEventListener("observe", (event: Event) => {
    try {
      const detail = asRecord((event as CustomEvent<unknown>).detail);
      if (!detail) return;

      if (detail["isScene"] === true) {
        three.scenes++;
        three.scene ??= detail;
        return;
      }

      // Рендерер узнаём по паре info + domElement: это его, и только его, поверхность.
      if (detail["info"] && detail["domElement"]) {
        three.renderer = detail;
        watchRender(detail);
      }
    } catch {
      /* чужой объект не обязан быть таким, как мы ждём */
    }
  });
}

/**
 * Подмена `renderer.render(scene, camera)`: это единственный способ узнать, какие сцену и камеру
 * игра рисует ПРЯМО СЕЙЧАС. Событие `observe` про камеру не рассказывает вообще, а сцен у игры
 * может быть несколько (меню, мир, миникарта).
 */
function watchRender(renderer: Record<string, unknown>): void {
  if (renderer["__idosProbeWatched"] === true) return;
  const original = renderer["render"];
  if (typeof original !== "function") return;

  renderer["__idosProbeWatched"] = true;
  const call = original as (...args: unknown[]) => unknown;
  renderer["render"] = function (this: unknown, ...args: unknown[]): unknown {
    const scene = asRecord(args[0]);
    const camera = asRecord(args[1]);
    if (scene) three.scene = scene;
    if (camera) three.camera = camera;
    return call.apply(this, args);
  };
}

function threeSnapshot(): Record<string, unknown> | null {
  if (!three.renderer && !three.scene) return null;
  const out: Record<string, unknown> = {};

  const info = asRecord(three.renderer?.["info"]);
  const render = asRecord(info?.["render"]);
  const memory = asRecord(info?.["memory"]);
  if (render) {
    // `calls` у WebGLRenderer, `drawCalls` у WebGPURenderer — представляются они одинаково.
    out["drawCalls"] = num(render["calls"]) ?? num(render["drawCalls"]);
    out["triangles"] = num(render["triangles"]);
    out["lines"] = num(render["lines"]);
    out["points"] = num(render["points"]);
    out["framesRendered"] = num(render["frame"]);
  }
  if (memory) {
    out["geometries"] = num(memory["geometries"]);
    out["textures"] = num(memory["textures"]);
  }

  const scene = three.scene;
  const traverse = scene?.["traverse"];
  if (scene && typeof traverse === "function") {
    let total = 0;
    let meshes = 0;
    let lights = 0;
    let hidden = 0;
    try {
      (traverse as (cb: (obj: unknown) => void) => void).call(
        scene,
        (obj: unknown) => {
          if (total > 20000) return; // защита от сцены-монстра: считаем, но не вечно
          total++;
          const node = asRecord(obj);
          if (!node) return;
          if (node["isMesh"] === true) meshes++;
          if (node["isLight"] === true) lights++;
          if (node["visible"] === false) hidden++;
        },
      );
      out["scene"] = {
        name: typeof scene["name"] === "string" ? scene["name"] : null,
        objects: total,
        meshes,
        lights,
        hidden,
        scenesCreated: three.scenes,
      };
    } catch {
      out["scene"] = { error: "scene.traverse failed" };
    }
  }

  // Позиция и направление камеры — прямо из мировой матрицы: третий столбец это её «взгляд»
  // (с минусом — камера в three смотрит вдоль -Z). Так не нужен импорт three ради Vector3.
  const elements = asRecord(three.camera?.["matrixWorld"])?.["elements"] as
    ArrayLike<number> | undefined;
  if (elements && elements.length >= 16) {
    const dx = -(elements[8] ?? 0);
    const dy = -(elements[9] ?? 0);
    const dz = -(elements[10] ?? 0);
    const len = Math.hypot(dx, dy, dz) || 1;
    out["camera"] = {
      pos: {
        x: round(elements[12] ?? 0),
        y: round(elements[13] ?? 0),
        z: round(elements[14] ?? 0),
      },
      lookDir: {
        x: round(dx / len),
        y: round(dy / len),
        z: round(dz / len),
      },
      fov: num(three.camera?.["fov"]),
    };
  }

  return out;
}

function round(value: number, digits = 2): number {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

/* ------------------------------------------------------------------- Pixi */

const pixi: {
  app: Record<string, unknown> | null;
  renderer: Record<string, unknown> | null;
  version: string | null;
} = { app: null, renderer: null, version: null };

/**
 * Канал, по которому PixiJS сам представляется наблюдателю — точный аналог `__THREE_DEVTOOLS__`.
 *
 * Pixi 8 при инициализации зовёт `globalThis.__PIXI_APP_INIT__(app, VERSION)`, а его рендерер —
 * `__PIXI_RENDERER_INIT__(renderer, VERSION)` (см. `utils/global/globalHooks`). Хуки задуманы для
 * расширения-девтулзов, и это ровно то, что нужно: игру править не надо, а на выходе живые
 * Application и Renderer. Ставить их обязательно ДО инициализации Pixi — отсюда установка при
 * импорте зонда.
 *
 * Оба хука ставятся не «вместо», а «поверх»: прежний (расширение браузера) вызывается следом.
 */
function capturePixi(): void {
  type Hook = (target: unknown, version?: string) => void;
  const holder = globalThis as typeof globalThis & {
    __PIXI_APP_INIT__?: Hook;
    __PIXI_RENDERER_INIT__?: Hook;
  };

  const previousApp = holder.__PIXI_APP_INIT__;
  holder.__PIXI_APP_INIT__ = (app: unknown, version?: string): void => {
    try {
      pixi.app = asRecord(app);
      pixi.version = version ?? pixi.version;
    } catch {
      /* чужой объект не обязан быть таким, как мы ждём */
    }
    previousApp?.(app, version);
  };

  const previousRenderer = holder.__PIXI_RENDERER_INIT__;
  holder.__PIXI_RENDERER_INIT__ = (
    renderer: unknown,
    version?: string,
  ): void => {
    try {
      pixi.renderer = asRecord(renderer);
      pixi.version = version ?? pixi.version;
    } catch {
      /* см. выше */
    }
    previousRenderer?.(renderer, version);
  };
}

/** Обход дерева отображения Pixi: у него нет `traverse`, только `children`. */
function countPixiTree(root: Record<string, unknown>): Record<string, unknown> {
  let total = 0;
  let hidden = 0;
  let depth = 0;

  const walk = (node: Record<string, unknown>, level: number): void => {
    if (total > 20000) return; // потолок как у three: считаем, но не вечно
    total++;
    if (node["visible"] === false || node["renderable"] === false) hidden++;
    if (level > depth) depth = level;

    const children = node["children"];
    if (!Array.isArray(children)) return;
    for (const child of children) {
      const record = asRecord(child);
      if (record) walk(record, level + 1);
    }
  };

  walk(root, 0);
  // Сам корень объектом сцены не считаем — интересно, что В нём.
  return { objects: Math.max(total - 1, 0), hidden, depth };
}

function pixiSnapshot(): Record<string, unknown> | null {
  const app = pixi.app;
  const renderer = pixi.renderer ?? asRecord(app?.["renderer"]);
  if (!app && !renderer) return null;

  const out: Record<string, unknown> = { version: pixi.version };

  if (renderer) {
    const type = renderer["type"];
    out["renderer"] = {
      // `name` у Pixi 8 это "webgl"/"webgpu"; `type` — числовой флаг того же самого.
      backend:
        typeof renderer["name"] === "string"
          ? renderer["name"]
          : (num(type) ?? null),
      width: num(renderer["width"]),
      height: num(renderer["height"]),
      resolution: num(renderer["resolution"]),
    };
  }

  const ticker = asRecord(app?.["ticker"]);
  if (ticker) {
    const fps = num(ticker["FPS"]);
    out["ticker"] = {
      fps: fps === null ? null : round(fps, 1),
      started: ticker["started"] ?? null,
    };
  }

  const stage = asRecord(app?.["stage"]);
  if (stage) {
    const tree = countPixiTree(stage);
    out["stage"] = {
      ...tree,
      label:
        typeof stage["label"] === "string"
          ? stage["label"]
          : typeof stage["name"] === "string"
            ? stage["name"]
            : null,
    };
  }

  return out;
}

/* ----------------------------------------------------------------- Phaser */

/**
 * У Phaser канала самопредставления НЕТ — и это проверено, а не предположено: `Game.boot` пишет
 * `window.PHASER_GAME = this` только под флагом `WEBGL_DEBUG`, а из готовых сборок
 * (`dist/phaser.esm.js`, которые и ставит npm) эта ветка вырезана целиком.
 *
 * Поэтому игру приходится ИСКАТЬ, а не ждать. Два источника, оба без кооперации игры:
 *   1. `window.PHASER_GAME` — есть в отладочных сборках и в превью, если бандлер взял `main`
 *      (у Phaser это исходники, а не dist);
 *   2. скан собственных ключей `window` на сигнатуру `Phaser.Game`.
 *
 * Поиск ленивый (только при сборке снимка) и с кэшем: перебирать глобалы каждый кадр незачем.
 */
// Кэшируется ИМЯ глобала, а не сам объект: игру можно пересоздать (host-shell перемонтирует сцену
// при смене режима), и ссылка на прежнюю осталась бы живой в памяти — зонд честно показывал бы
// уничтоженную игру. Перечитывание по ключу всегда отдаёт текущую.
let phaserKey: string | null = null;

function looksLikePhaserGame(value: unknown): boolean {
  const game = asRecord(value);
  if (!game) return false;
  return (
    typeof game["isBooted"] === "boolean" &&
    asRecord(game["scene"]) !== null &&
    Array.isArray(asRecord(game["scene"])?.["scenes"]) &&
    asRecord(game["loop"]) !== null
  );
}

function findPhaserGame(): Record<string, unknown> | null {
  const holder = globalThis as typeof globalThis & Record<string, unknown>;

  const at = (key: string): Record<string, unknown> | null => {
    try {
      return looksLikePhaserGame(holder[key]) ? asRecord(holder[key]) : null;
    } catch {
      // Чтение чужого свойства window может бросить (кросс-доменный фрейм) — не наша забота.
      return null;
    }
  };

  if (phaserKey) {
    const cached = at(phaserKey);
    if (cached) return cached;
    phaserKey = null;
  }

  for (const key of ["PHASER_GAME", ...Object.keys(holder)]) {
    const found = at(key);
    if (found) {
      phaserKey = key;
      return found;
    }
  }
  return null;
}

function phaserSnapshot(): Record<string, unknown> | null {
  const game = findPhaserGame();
  if (!game) return null;

  const out: Record<string, unknown> = {
    booted: game["isBooted"] ?? null,
    running: game["isRunning"] ?? null,
  };

  const fps = num(asRecord(game["loop"])?.["actualFps"]);
  if (fps !== null) out["fps"] = round(fps, 1);

  const renderer = asRecord(game["renderer"]);
  if (renderer) {
    // У Phaser `type` — числовая константа: 1 = CANVAS, 2 = WEBGL.
    const type = num(renderer["type"]);
    out["renderer"] = {
      backend: type === 2 ? "webgl" : type === 1 ? "canvas" : (type ?? null),
      width: num(renderer["width"]),
      height: num(renderer["height"]),
    };
  }

  const scenes = asRecord(game["scene"])?.["scenes"];
  if (Array.isArray(scenes)) {
    const list: Record<string, unknown>[] = [];
    for (const raw of scenes.slice(0, 12)) {
      const sys = asRecord(asRecord(raw)?.["sys"]);
      const settings = asRecord(sys?.["settings"]);
      const displayList = asRecord(sys?.["displayList"]);
      const camera = asRecord(asRecord(sys?.["cameras"])?.["main"]);

      const entry: Record<string, unknown> = {
        key: settings?.["key"] ?? null,
        active: settings?.["active"] ?? null,
        visible: settings?.["visible"] ?? null,
        objects: Array.isArray(displayList?.["list"])
          ? (displayList["list"] as unknown[]).length
          : null,
      };
      if (camera) {
        entry["camera"] = {
          scrollX: round(num(camera["scrollX"]) ?? 0),
          scrollY: round(num(camera["scrollY"]) ?? 0),
          zoom: round(num(camera["zoom"]) ?? 1),
        };
      }
      list.push(entry);
    }
    out["scenes"] = list;
    // «Активная» сцена — та, что реально обновляется: по ней и судят, что происходит на экране.
    out["activeScenes"] = list.filter((s) => s["active"] === true).length;
  }

  return out;
}

/* ------------------------------------------------------------- пиксели */

function hex(r: number, g: number, b: number): string {
  const part = (v: number): string => v.toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * Чтение редкой сетки пикселей — 36 точек вместо картинки: скриншотов здесь нет по решению
 * владельца, а «все 36 проб одного цвета» ловит белый экран ничуть не хуже.
 *
 * Читать можно в любой момент, потому что зонд принудительно включает `preserveDrawingBuffer`
 * (см. `captureCanvases`); без него содержимое буфера пропадало бы сразу после композитинга кадра.
 */
function readGrid(rec: CanvasRecord): number[][] | null {
  const width = rec.canvas.width;
  const height = rec.canvas.height;
  if (width < 2 || height < 2) return null;

  const at = (i: number, size: number): number =>
    Math.min(size - 1, Math.floor(((i + 0.5) / PIXEL_GRID) * size));

  if (rec.gl) {
    const gl = rec.gl;
    if (gl.isContextLost()) return null;

    // Игра могла оставить привязанным свой render target — тогда мы прочли бы не экран. Снимаем
    // привязку на время чтения и возвращаем ровно ту, что была.
    const previous = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    if (previous) gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const pixel = new Uint8Array(4);
    const samples: number[][] = [];
    for (let iy = 0; iy < PIXEL_GRID; iy++) {
      for (let ix = 0; ix < PIXEL_GRID; ix++) {
        gl.readPixels(
          at(ix, width),
          at(iy, height),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        samples.push([
          pixel[0] ?? 0,
          pixel[1] ?? 0,
          pixel[2] ?? 0,
          pixel[3] ?? 0,
        ]);
      }
    }

    if (previous) gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
    return samples;
  }

  if (rec.ctx2d) {
    const samples: number[][] = [];
    for (let iy = 0; iy < PIXEL_GRID; iy++) {
      for (let ix = 0; ix < PIXEL_GRID; ix++) {
        const data = rec.ctx2d.getImageData(
          at(ix, width),
          at(iy, height),
          1,
          1,
        ).data;
        samples.push([data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0]);
      }
    }
    return samples;
  }

  return null;
}

function pixelStats(samples: number[][]): Record<string, unknown> {
  const colours = new Set<string>();
  let transparent = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (const [pr, pg, pb, pa] of samples) {
    const alpha = pa ?? 0;
    if (alpha < 8) transparent++;
    r += pr ?? 0;
    g += pg ?? 0;
    b += pb ?? 0;
    colours.add(hex(pr ?? 0, pg ?? 0, pb ?? 0));
  }

  const n = samples.length || 1;
  const uniform = colours.size <= 1;
  const average = hex(Math.round(r / n), Math.round(g / n), Math.round(b / n));

  return {
    sampled: samples.length,
    distinctColours: colours.size,
    uniform,
    colour: uniform ? ([...colours][0] ?? null) : null,
    averageColour: average,
    transparentSamples: transparent,
    note: uniform
      ? `every sampled pixel is the same colour — the frame is a flat fill (a blank/white/black screen looks exactly like this)`
      : `${colours.size} distinct colours across ${samples.length} samples — something is actually drawn`,
  };
}

/** Прочитать сетку прямо сейчас, обернув всё, что может пойти не так, в ответ, а не в исключение. */
function readNow(
  rec: CanvasRecord,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  try {
    const samples = readGrid(rec);
    return samples
      ? { ...pixelStats(samples), ...extra }
      : { sampled: 0, note: "could not read pixels from this canvas" };
  } catch (error: unknown) {
    return { sampled: 0, note: `pixel read failed: ${stringifyArg(error)}` };
  }
}

/**
 * Прочитать пиксели, по возможности — в кадре, где что-то нарисовано.
 *
 * Сначала ждём кадр с отрисовкой: у живой игры это самая свежая картинка. Не дождались — читаем всё
 * равно: буфер сохраняется принудительно (см. `captureCanvases`), поэтому там лежит ПОСЛЕДНИЙ
 * нарисованный кадр. Отдать в такой ситуации «ничего не вижу» было бы худшим из ответов: именно
 * когда петля встала, картинка нужнее всего.
 */
function samplePixels(rec: CanvasRecord): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    if (!rawRaf) {
      resolve(
        readNow(rec, {
          drewDuringSample: false,
          frameNote: "read outside an animation frame",
        }),
      );
      return;
    }

    let attempts = 0;
    let settled = false;
    const finish = (value: Record<string, unknown>): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };

    const timer = window.setTimeout(
      () =>
        finish(
          readNow(rec, {
            drewDuringSample: false,
            staleFrame: true,
            frameNote:
              `nothing was drawn within ${FRAME_WAIT_MS}ms, so this is the LAST frame the game ` +
              "rendered, not a live one — the render loop is stopped, the scene only redraws on " +
              "demand, or the preview tab is in the background",
          }),
        ),
      FRAME_WAIT_MS,
    );

    const tick = (): void => {
      if (settled) return;
      const before = rec.frames + rec.draws;
      rawRaf(() => {
        if (settled) return;
        const drew = rec.frames + rec.draws > before;
        attempts++;
        // Ещё один шанс поймать кадр с отрисовкой; на третьей попытке читаем как есть.
        if (!drew && attempts < 3) {
          tick();
          return;
        }
        finish(readNow(rec, { drewDuringSample: drew }));
      });
    };

    tick();
  });
}

/* --------------------------------------------------------- сборка снимка */

/** Полотна документа, самое большое — первым: оно почти всегда и есть игра. */
function canvasesByArea(): {
  el: HTMLCanvasElement;
  rec: CanvasRecord | null;
}[] {
  const list = Array.from(document.querySelectorAll("canvas")).map((el) => ({
    el,
    rec: canvasRecords.find((rec) => rec.canvas === el) ?? null,
  }));
  return list.sort(
    (a, b) => b.el.width * b.el.height - a.el.width * a.el.height,
  );
}

function describeCanvas(entry: {
  el: HTMLCanvasElement;
  rec: CanvasRecord | null;
}): Record<string, unknown> {
  const rect = entry.el.getBoundingClientRect();
  const rec = entry.rec;
  return {
    context: rec?.kind ?? "unknown (context created before the probe, or none)",
    buffer: `${entry.el.width}x${entry.el.height}`,
    onScreen: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    visible: rect.width > 0 && rect.height > 0,
    framesDrawn: rec?.frames ?? null,
    drawCalls: rec?.draws ?? null,
    msSinceLastDraw:
      rec && rec.lastDrawAt > 0 ? Date.now() - rec.lastDrawAt : null,
  };
}

function platformState(): Record<string, unknown> {
  const host = agentGlobal()?.host;
  return {
    titleId: probeOptions.titleId ?? host?.titleId ?? null,
    url: window.location.href,
    // Экран хоста: loading | login | game. «Игрок не залогинен» — самая частая причина того, что
    // «игра не работает», и без этой строки агент ищет причину в коде игры.
    screen: host?.screen ?? "unknown (host state not published)",
    loggedIn: host?.loggedIn ?? null,
    userId: host?.userId ?? null,
    modulesInstalled: host?.modules ?? null,
    // Роли общего интерфейса. Отвечает на «почему у шаблона пропал кошелёк/баланс»: его взял
    // поставщик роли (обычно game-hud), это не поломка.
    sharedUi: host?.sharedUi ?? null,
  };
}

/** Журнал шины событий. Чужой код — поэтому под try: сломанный журнал не должен ронять ответ. */
function eventBusState(): unknown {
  const read = agentGlobal()?.events;
  if (typeof read !== "function") return null;
  try {
    return read();
  } catch (error: unknown) {
    return { error: stringifyArg(error) };
  }
}

/**
 * Автоматический слой: что видно в приложении БЕЗ его участия.
 *
 * Возвращается всегда — и когда модули открылись агенту, и когда нет. Слепой тишины быть не должно:
 * даже у игры, о которой никто ничего не рассказал, есть полотно, кадры и цвет экрана.
 */
async function observeRuntime(options: {
  pixels: boolean;
}): Promise<Record<string, unknown>> {
  const canvases = canvasesByArea();
  const main = canvases[0] ?? null;
  const notes: string[] = [];

  const glFps = perSecond(glFrameTimes);
  const rafFps = perSecond(rafFrameTimes);
  const rendering: Record<string, unknown> = {
    fps: glFps > 0 ? glFps : rafFps,
    fpsSource:
      glFps > 0 ? "canvas clear() calls" : "requestAnimationFrame callbacks",
    animationFramesPerSecond: rafFps,
    canvasFramesPerSecond: glFps,
  };

  // Движки опрашиваются ДО заметок про «ничего не анимируется»: их собственный счётчик кадров эту
  // заметку отменяет, и выдать обе разом значило бы противоречить самому себе в одном ответе.
  const threeInfo = threeSnapshot();
  const pixiInfo = pixiSnapshot();
  const phaserInfo = phaserSnapshot();

  // Кадры, о которых отчитывается САМ движок. Им веры больше, чем счётчику по полотну: движок не
  // обязан чистить буфер каждый кадр, и тогда наш счётчик занижает. Поймано вживую — Phaser
  // сообщал 60, а полотно давало 1.
  const engineFps =
    num(phaserInfo?.["fps"]) ?? num(asRecord(pixiInfo?.["ticker"])?.["fps"]);
  const canvasFps = glFps > 0 ? glFps : rafFps;
  const engineRunning = engineFps !== null && engineFps > 5;
  if (engineFps !== null) rendering["engineFps"] = engineFps;

  if (!main) {
    notes.push(
      "No <canvas> in the document: this is a DOM app (or the game has not mounted its canvas yet). Read the page instead.",
    );
  } else if (engineRunning && canvasFps <= 5) {
    notes.push(
      `The engine reports ${engineFps} fps while the canvas counter sees almost none. Trust the engine: the counter only sees frames that clear the buffer, and a page that has just rebuilt has not accumulated any yet. The game IS running.`,
    );
  } else if (rafFps === 0 && glFps === 0) {
    // Порядок причин здесь не случаен: пауза стоит ПЕРВОЙ, потому что она самая частая и самая
    // безобидная. Живой прогон показал именно её — игра ждала клика по полотну, а заметка звучала
    // как «петля мертва», то есть звала чинить исправное.
    notes.push(
      "Nothing is animating: no animation frame ran in the last second. Most often the game is simply PAUSED and waiting for the player to click the canvas (a click via SendInput starts it — check the frames again after that). It is also normal for a scene that only redraws on demand. Only if neither applies is the render loop actually dead (an exception inside it, or it was never started) — the console says which.",
    );
  }

  if (!threeInfo && !pixiInfo && !phaserInfo && main?.rec) {
    notes.push(
      "A canvas is present but no engine identified itself: three.js and PixiJS announce themselves automatically, and Phaser is looked up in the page globals. So this is either another engine (Babylon, raw WebGL/2d), or Phaser that keeps its Game object out of reach. The canvas numbers above (fps, draw calls, pixels) still hold — only the scene/camera detail is missing.",
    );
  }

  let pixels: Record<string, unknown> | null = null;
  if (options.pixels && main?.rec) {
    pixels = await samplePixels(main.rec);
    if (pixels["uniform"] === true) {
      notes.push(
        "The sampled frame is ONE flat colour. Together with a live fps that usually means the scene renders but nothing is in view (camera inside geometry, everything culled, materials/lights missing); with fps 0 it means nothing is being drawn at all.",
      );
    }
  }

  return {
    platform: platformState(),
    canvas: main ? describeCanvas(main) : null,
    otherCanvases: canvases.length > 1 ? canvases.length - 1 : 0,
    rendering,
    three: threeInfo,
    pixi: pixiInfo,
    phaser: phaserInfo,
    pixels,
    notes,
  };
}

/** Однострочная выжимка автоматического слоя — она подмешивается в снимок страницы. */
function summarize(observation: Record<string, unknown>): string {
  const parts: string[] = [];

  const canvas = asRecord(observation["canvas"]);
  if (canvas)
    parts.push(
      `canvas ${String(canvas["buffer"])} (${String(canvas["context"])})`,
    );

  const rendering = asRecord(observation["rendering"]);
  if (rendering) parts.push(`${String(rendering["fps"])} fps`);

  const threeInfo = asRecord(observation["three"]);
  if (threeInfo) {
    const scene = asRecord(threeInfo["scene"]);
    if (scene)
      parts.push(`three.js scene: ${String(scene["objects"])} objects`);
    if (threeInfo["drawCalls"] !== null && threeInfo["drawCalls"] !== undefined)
      parts.push(`${String(threeInfo["drawCalls"])} draw calls`);
  }

  const pixiInfo = asRecord(observation["pixi"]);
  const pixiStage = asRecord(pixiInfo?.["stage"]);
  if (pixiStage)
    parts.push(`PixiJS stage: ${String(pixiStage["objects"])} display objects`);

  const phaserInfo = asRecord(observation["phaser"]);
  if (phaserInfo) {
    const scenes = phaserInfo["scenes"];
    parts.push(
      `Phaser: ${String(phaserInfo["activeScenes"] ?? 0)} active scene(s)` +
        (Array.isArray(scenes) ? ` of ${scenes.length}` : ""),
    );
  }

  const pixels = asRecord(observation["pixels"]);
  if (pixels && num(pixels["sampled"])) {
    parts.push(
      pixels["uniform"] === true
        ? `the whole frame is ${String(pixels["colour"])}`
        : `${String(pixels["distinctColours"])} distinct colours on screen`,
    );
  }

  const platform = asRecord(observation["platform"]);
  if (platform && platform["screen"])
    parts.push(`host screen: ${String(platform["screen"])}`);

  return parts.join(", ");
}

/* ------------------------------------------------------ синтетический ввод */

// Универсальные «руки» — для игр, которые НЕ описали свои действия через `exposeToAgent`.
// Работает не всегда, и это честно сказано в ответе: движок, который гейтит ввод на Pointer Lock,
// синтетические события игнорирует, а Pointer Lock в кросс-доменном iframe запрещён браузером.

const KEY_CODES: Record<string, number> = {
  Space: 32,
  Enter: 13,
  Escape: 27,
  Tab: 9,
  Backspace: 8,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  ShiftLeft: 16,
  ShiftRight: 16,
  ControlLeft: 17,
  ControlRight: 17,
};

/** `key` по `code`: движки читают то одно, то другое, поэтому заполняем оба. */
function keyFromCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return " ";
  if (code.startsWith("Shift")) return "Shift";
  if (code.startsWith("Control")) return "Control";
  if (code.startsWith("Alt")) return "Alt";
  return code;
}

function legacyKeyCode(code: string): number {
  const known = KEY_CODES[code];
  if (known) return known;
  if (code.startsWith("Key")) return code.charCodeAt(3);
  if (code.startsWith("Digit")) return 48 + Number(code.slice(5));
  return 0;
}

/** Кого считаем игрой: самое большое полотно, иначе — активный элемент. */
function inputTarget(): EventTarget {
  const main = canvasesByArea()[0];
  return main?.el ?? document.activeElement ?? document.body ?? window;
}

function keyEvent(type: string, code: string): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    code,
    key: keyFromCode(code),
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  // keyCode/which в конструкторе не поддерживаются, а игры на них до сих пор смотрят.
  const legacy = legacyKeyCode(code);
  Object.defineProperty(event, "keyCode", { get: () => legacy });
  Object.defineProperty(event, "which", { get: () => legacy });
  return event;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function sendKey(code: string, ms: number): Promise<void> {
  const target = inputTarget();
  if (target instanceof HTMLElement) target.focus?.();
  target.dispatchEvent(keyEvent("keydown", code));
  await wait(Math.min(Math.max(ms, 16), MAX_INPUT_HOLD_MS));
  target.dispatchEvent(keyEvent("keyup", code));
}

/** Координата: 0..1 читается как доля полотна, больше — как CSS-пиксели. */
function resolveCoord(value: unknown, size: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0.5;
  return n >= 0 && n <= 1 ? n * size : n;
}

/** Типы, после которых кнопка уже отпущена: у них `buttons` обязан быть нулём. */
const RELEASE_EVENTS = new Set([
  "mouseup",
  "pointerup",
  "click",
  "mousemove",
  "pointermove",
]);

/**
 * Событие указателя. Для `pointer*` строим именно PointerEvent: движки на pointer-событиях
 * (Phaser 4) читают у него `pointerId`/`isPrimary`, и обычный MouseEvent они отбрасывают.
 */
function pointerLikeEvent(
  type: string,
  x: number,
  y: number,
  button: number,
  movement?: { dx: number; dy: number },
): MouseEvent {
  const init: PointerEventInit = {
    clientX: x,
    clientY: y,
    button,
    buttons: RELEASE_EVENTS.has(type) ? 0 : 1 << button,
    bubbles: true,
    cancelable: true,
    composed: true,
    movementX: movement?.dx ?? 0,
    movementY: movement?.dy ?? 0,
  };

  if (type.startsWith("pointer") && typeof PointerEvent === "function") {
    return new PointerEvent(type, {
      ...init,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
  }
  return new MouseEvent(type, init);
}

async function sendClick(
  xArg: unknown,
  yArg: unknown,
  button: number,
): Promise<void> {
  const target = inputTarget();
  const element = target instanceof Element ? target : document.body;
  const rect = element.getBoundingClientRect();
  const x = rect.left + resolveCoord(xArg, rect.width);
  const y = rect.top + resolveCoord(yArg, rect.height);

  for (const type of ["pointerdown", "mousedown"]) {
    target.dispatchEvent(pointerLikeEvent(type, x, y, button));
  }
  await wait(30);
  for (const type of ["pointerup", "mouseup", "click"]) {
    target.dispatchEvent(pointerLikeEvent(type, x, y, button));
  }
}

async function sendMove(dx: number, dy: number): Promise<void> {
  const target = inputTarget();
  const element = target instanceof Element ? target : document.body;
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + dx;
  const y = rect.top + rect.height / 2 + dy;
  // movementX/movementY — то, что читает камера от первого лица; clientX/Y — то, что читают
  // обычные обработчики. Заполняем оба, чтобы не гадать, какой путь у игры.
  target.dispatchEvent(pointerLikeEvent("mousemove", x, y, 0, { dx, dy }));
  target.dispatchEvent(pointerLikeEvent("pointermove", x, y, 0, { dx, dy }));
  await wait(16);
}

/**
 * Синтетический ввод + снимок ПОСЛЕ него (как readPage после клика).
 *
 * Ответ всегда несёт `pointerLockActive`: если игра требует захвата указателя, ввод до неё не
 * дойдёт — и агент должен прочитать это как «управление не проверено», а не «управление сломано».
 */
async function sendInput(raw: unknown): Promise<unknown> {
  const args = asRecord(raw) ?? {};
  const type = String(args["type"] ?? "key");

  switch (type) {
    case "key": {
      const code = String(args["code"] ?? args["key"] ?? "");
      if (!code)
        throw new Error("input type 'key' needs a code, e.g. \"KeyW\"");
      await sendKey(code, Number(args["ms"] ?? 200));
      break;
    }
    case "click":
      await sendClick(args["x"], args["y"], Number(args["button"] ?? 0));
      break;
    case "move":
      await sendMove(Number(args["dx"] ?? 0), Number(args["dy"] ?? 0));
      break;
    default:
      throw new Error(`unknown input type '${type}' — use key | click | move`);
  }

  await settle();
  // Именно на истинность, а не `!== null`: там, где Pointer Lock не поддержан вовсе, свойство
  // приходит `undefined`, и строгое сравнение объявило бы захват активным, которого нет.
  const locked = Boolean(document.pointerLockElement);
  return {
    sent: { type, ...args },
    pointerLockActive: locked,
    note: locked
      ? "Pointer Lock is active, so the game receives this input the same way it receives the player's."
      : "Synthetic input was dispatched. If the game gates controls on Pointer Lock it ignored this — Pointer Lock cannot be acquired inside the preview iframe. A module's exposeToAgent actions are the reliable path.",
    observation: await observeRuntime({ pixels: true }),
    modules: moduleSurfaces(),
  };
}

/* ------------------------------------------------------- сериализация DOM */

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "NOSCRIPT",
  "TEMPLATE",
  "HEAD",
]);

const INTERACTIVE_TAGS = new Set([
  "BUTTON",
  "A",
  "INPUT",
  "SELECT",
  "TEXTAREA",
]);

function isInteractive(el: Element): boolean {
  if (INTERACTIVE_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute("role");
  if (
    role === "button" ||
    role === "link" ||
    role === "tab" ||
    role === "menuitem"
  )
    return true;
  return el.hasAttribute("data-testid") && el.hasAttribute("tabindex");
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return true;
  // Нулевой прямоугольник у контейнера — норма (например, обёртка с absolute-детьми):
  // считаем видимым, если браузер не выключил его целиком.
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

/** Собственный текст узла — без текста детей (их напечатают они сами). */
function ownText(el: Element): string {
  let text = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
  }
  return clip(text, MAX_TEXT);
}

function describe(el: Element, ref: string | null): string {
  const parts: string[] = [el.tagName.toLowerCase()];

  const id = el.getAttribute("id");
  if (id) parts[0] += `#${id}`;

  const cls = el.getAttribute("class");
  if (cls) {
    const first = cls.trim().split(/\s+/).slice(0, 2).join(".");
    if (first) parts[0] += `.${first}`;
  }

  if (ref) parts.push(`[${ref}]`);

  const label = el.getAttribute("aria-label");
  const testId = el.getAttribute("data-testid");
  if (testId) parts.push(`testid=${testId}`);

  const text = ownText(el) || (label ? clip(label, MAX_TEXT) : "");
  if (text) parts.push(JSON.stringify(text));

  const flags: string[] = [];
  if (el.hasAttribute("disabled")) flags.push("disabled");
  if ((el as HTMLInputElement).checked) flags.push("checked");
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const value = (el as HTMLInputElement).value;
    if (value) flags.push(`value=${JSON.stringify(clip(value, 40))}`);
    const placeholder = el.getAttribute("placeholder");
    if (placeholder)
      flags.push(`placeholder=${JSON.stringify(clip(placeholder, 40))}`);
  }
  if (el.tagName === "CANVAS") {
    const canvas = el as HTMLCanvasElement;
    flags.push(`${canvas.width}x${canvas.height}`);
  }
  if (flags.length) parts.push(`(${flags.join(", ")})`);

  return parts.join(" ");
}

function readDom(): { tree: string; truncated: boolean } {
  refs = new Map<string, Element>();
  const lines: string[] = [];
  let nodes = 0;
  let refSeq = 0;
  let truncated = false;

  const walk = (el: Element, depth: number): void => {
    if (truncated) return;
    if (SKIP_TAGS.has(el.tagName)) return;
    if (nodes >= MAX_NODES || depth > MAX_DEPTH) {
      truncated = true;
      return;
    }

    const visible = isVisible(el);
    let ref: string | null = null;
    if (visible && isInteractive(el)) {
      ref = `ref_${++refSeq}`;
      refs.set(ref, el);
    }

    const line = `${"  ".repeat(depth)}${describe(el, ref)}${visible ? "" : " (hidden)"}`;
    lines.push(line);
    nodes++;

    // В скрытое поддерево не спускаемся: сам факт «модалка есть и она скрыта» полезен, её
    // внутренности — нет.
    if (!visible) return;

    const children = Array.from(el.children);
    const shown = children.slice(0, MAX_SIBLINGS);
    for (const child of shown) walk(child, depth + 1);
    if (children.length > shown.length) {
      lines.push(
        `${"  ".repeat(depth + 1)}… +${children.length - shown.length} more sibling(s)`,
      );
    }
  };

  if (document.body) walk(document.body, 0);

  let tree = lines.join("\n");
  if (tree.length > MAX_TREE_CHARS) {
    tree = `${tree.slice(0, MAX_TREE_CHARS)}\n… (tree truncated)`;
    truncated = true;
  }

  return { tree, truncated };
}

/**
 * Полотно, которое стоит считать «главным экраном»: либо оно занимает заметную часть окна, либо в
 * дереве вообще не за что зацепиться. Маленький canvas рядом с обычным интерфейсом (график,
 * спарклайн, аватар) главным экраном не объявляем — иначе снимок каждой DOM-страницы обрастал бы
 * рассказом про отрисованную игру, которой там нет.
 */
function dominantCanvas(): {
  el: HTMLCanvasElement;
  rec: CanvasRecord | null;
} | null {
  const main = canvasesByArea()[0];
  if (!main) return null;

  const rect = main.el.getBoundingClientRect();
  const viewport = window.innerWidth * window.innerHeight;
  const share = viewport > 0 ? (rect.width * rect.height) / viewport : 0;
  if (share >= 0.15) return main;

  // Нулевой прямоугольник — не обязательно «полотна не видно»: измерять могли до раскладки. Тогда
  // судим по размеру самого буфера, иначе снимок игры с HUD-кнопкой молча терял бы весь рассказ
  // про экран (поймано прогоном под jsdom, где размеров нет вообще).
  const unmeasured = rect.width === 0 && rect.height === 0;
  if (unmeasured && main.el.width >= 200 && main.el.height >= 200) return main;

  return refs.size === 0 ? main : null;
}

/**
 * Снимок страницы: дерево DOM плюс — у отрисованной игры — выжимка автоматического наблюдения.
 *
 * У Three/Phaser дерево честно пустое: весь мир внутри одного `<canvas>`. Раньше здесь стояла
 * только пометка «это не пустой экран», и агент оставался ни с чем. Теперь в ту же строку уезжают
 * настоящие цифры (кадры, объекты сцены, цвет полотна) — их зонд добывает сам, без участия игры.
 */
async function readPage(): Promise<{ tree: string; truncated: boolean }> {
  const page = readDom();
  // Порядок важен: `dominantCanvas` смотрит на `refs`, которые заполняет `readDom`.
  if (!dominantCanvas()) return page;

  const exposed = Object.keys(agentModules());
  const head =
    "\n\n[This screen is drawn into a <canvas>: the DOM above says nothing about what happens " +
    "inside it, so a tree with nothing in it is NOT an empty screen.";

  let note = head;
  try {
    const summary = summarize(await observeRuntime({ pixels: true }));
    if (summary) note += ` Observed automatically: ${summary}.`;
  } catch {
    /* автоматический слой не обязан удаваться — дерево важнее и уже собрано */
  }

  note +=
    exposed.length > 0
      ? ` Call GetGameState for the full picture — modules exposing a debug surface: ${exposed.join(", ")}.]`
      : ` Call GetGameState for the full picture. No module exposes a debug surface ` +
        `(ctx.exposeToAgent), so gameplay state beyond these numbers is not observable — adding that ` +
        `surface to the game module is what makes it observable.]`;

  return { tree: page.tree + note, truncated: page.truncated };
}

/* ------------------------------------------------------------- действия */

function settle(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, SETTLE_MS));
}

function resolveRef(ref: unknown): Element {
  if (typeof ref !== "string") throw new Error("ref is required");
  const el = refs.get(ref);
  if (!el) throw new Error(`${ref} is unknown — call readPage first`);
  if (!el.isConnected)
    throw new Error(
      `${ref} is no longer in the document — call readPage again`,
    );
  return el;
}

async function clickRef(ref: unknown): Promise<unknown> {
  const el = resolveRef(ref);
  if (typeof (el as HTMLElement).click !== "function")
    throw new Error("element is not clickable");
  (el as HTMLElement).click();
  await settle();
  return readPage();
}

async function typeIntoRef(ref: unknown, text: unknown): Promise<unknown> {
  const el = resolveRef(ref);
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement))
    throw new Error("element is not a text field");

  // Контролируемому React-полю мало el.value = …: React слушает нативный сеттер, и без него
  // состояние компонента не обновится, а значение откатится на следующем рендере.
  const proto =
    el instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, String(text ?? ""));
  else el.value = String(text ?? "");

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
  return readPage();
}

/* ------------------------------------------------- состояние игровых модулей */

/**
 * Снимок всех модулей, которые открылись агенту, плюс перечень их действий.
 *
 * Ошибку в чужом `state()` не роняем на весь ответ: один сломанный модуль не должен ослеплять
 * агента по остальным — он получит текст ошибки ровно на месте этого модуля.
 */
function moduleSurfaces(): Record<string, unknown> {
  const modules = agentModules();
  const ids = Object.keys(modules);
  if (ids.length === 0) {
    return {
      available: false,
      hint:
        "No module exposes a debug surface (ctx.exposeToAgent), so nothing beyond the automatic " +
        "observation above can be seen: player position, score, current turn and the ability to DRIVE " +
        "the game all come from that surface. If you need them, add exposeToAgent to the game module's " +
        "setup() — it is a few lines and it is what makes the game verifiable from here.",
    };
  }

  const out: Record<string, unknown> = {};
  for (const id of ids) {
    const api = modules[id];
    try {
      out[id] = {
        state: api?.state ? api.state() : null,
        actions: api?.describeActions ?? {},
      };
    } catch (error: unknown) {
      out[id] = { error: stringifyArg(error) };
    }
  }
  return { available: true, modules: out };
}

/**
 * Ответ на `gameState`: автоматический слой ВСЕГДА, поверхности модулей — если они есть.
 *
 * Порядок именно такой и он важен: даже игра, о которой никто ничего не рассказал, отвечает
 * цифрами (полотно, кадры, сцена, цвет экрана), а не пустотой. «Мне ничего не видно» — худший
 * из возможных ответов: он неотличим от «на экране пусто» и толкает агента чинить исправное.
 */
async function gameState(): Promise<unknown> {
  return {
    observed: await observeRuntime({ pixels: true }),
    exposedByGame: moduleSurfaces(),
    // События между модулями: log (последние 50), listeners/emitted (кто что слушает и шлёт) и
    // mismatches — подсказки вида «слушают @1, а шлют @2».
    events: eventBusState(),
  };
}

/** Выполнить действие модуля и вернуть состояние ПОСЛЕ него — как readPage после клика. */
async function gameAction(
  moduleId: unknown,
  action: unknown,
  rawArgs: unknown,
): Promise<unknown> {
  const modules = agentModules();
  const id = typeof moduleId === "string" ? moduleId : Object.keys(modules)[0];
  if (!id) throw new Error("no module exposes actions");

  const api = modules[id];
  if (!api) throw new Error(`unknown module '${id}'`);

  const name = typeof action === "string" ? action : "";
  const fn = api.actions?.[name];
  if (!fn) {
    const known = Object.keys(api.actions ?? {}).join(", ") || "none";
    throw new Error(
      `unknown action '${name}' for '${id}' — available: ${known}`,
    );
  }

  const callArgs =
    rawArgs && typeof rawArgs === "object"
      ? (rawArgs as Record<string, unknown>)
      : {};
  const result = await fn(callArgs);

  // Состояние после действия — то, ради чего действие и звали.
  return {
    module: id,
    action: name,
    result: result ?? null,
    state: api.state ? api.state() : null,
  };
}

/* ---------------------------------------------------------------- протокол */

async function handle(
  cmd: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (cmd) {
    case "hello":
      return {
        ready: true,
        titleId: probeOptions.titleId ?? null,
        url: window.location.href,
      };

    case "readPage": {
      const page = await readPage();
      return {
        ...page,
        url: window.location.href,
        titleId: probeOptions.titleId ?? null,
      };
    }

    case "console":
      return { console: consoleLog.slice(), network: networkLog.slice() };

    case "click":
      return await clickRef(args["ref"]);

    case "type":
      return await typeIntoRef(args["ref"], args["text"]);

    case "gameState":
      return await gameState();

    case "gameAction":
      return await gameAction(args["module"], args["action"], args["args"]);

    case "input":
      return await sendInput(args["args"]);

    default:
      throw new Error(`unknown command '${cmd}'`);
  }
}

/**
 * Ставит зонд (и дополняет его данными о тайтле при повторном вызове).
 *
 * Модуль ставит зонд САМ при импорте — см. вызов внизу файла. Это не стилистика: перехват
 * console обязан встать раньше, чем упадёт что-нибудь на старте (например config.ts, который
 * бросает при нераспознанном тайтле), а вызовы из main.tsx исполняются уже ПОСЛЕ того, как
 * отработали тела всех импортированных модулей. Поэтому в main.tsx этот импорт стоит первым.
 *
 * Вне iframe (обычный запуск игры) не делает ничего.
 */
export function installPreviewProbe(options: PreviewProbeOptions = {}): void {
  probeOptions = { ...probeOptions, ...options };
  if (installed) return;
  if (typeof window === "undefined") return;
  // Не в iframe — значит это не превью дашборда. Ни перехватов, ни слушателей.
  if (window.self === window.top) return;

  installed = true;
  captureConsole();
  captureNetwork();
  // Перехваты автоматического наблюдения ставятся ЗДЕСЬ, при импорте зонда, и это единственный
  // момент, когда они успевают: `getContext` надо подменить раньше, чем движок создаст полотно, а
  // глобалы `__THREE_DEVTOOLS__` и `__PIXI_*_INIT__` — раньше, чем three.js и Pixi построят свои
  // рендереры (оба смотрят на них при инициализации и второго шанса представиться не дают).
  // Phaser своего канала не имеет вовсе — его игру ищут лениво, при сборке снимка.
  captureFrames();
  captureCanvases();
  captureThree();
  capturePixi();

  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as ProbeRequest | undefined;
    if (!data || data.wire !== WIRE || typeof data.id !== "string") return;
    // Чужой встраиватель (публичный сайт) сюда не пройдёт — и не узнает, что зонд вообще есть.
    if (!isAllowedOrigin(event.origin)) return;

    const source = event.source as Window | null;
    if (!source) return;

    const reply = (payload: Record<string, unknown>): void => {
      source.postMessage({ wire: WIRE, id: data.id, ...payload }, event.origin);
    };

    void handle(data.cmd, data.args ?? {})
      .then((result) => reply({ ok: true, data: result }))
      .catch((error: unknown) =>
        reply({ ok: false, error: stringifyArg(error) }),
      );
  });
}

// Само-установка при импорте — см. комментарий выше.
installPreviewProbe();
