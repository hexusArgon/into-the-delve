let tip: HTMLElement | null = null;

export function bindTip(
  el: HTMLElement,
  name: string | (() => string),
  text: string | (() => string),
  nameColor?: string | (() => string | undefined),
): void {
  const show = (event: PointerEvent): void => {
    const node = tipBox();
    node.replaceChildren();
    const title = document.createElement("div");
    title.textContent = typeof name === "function" ? name() : name;
    const color = typeof nameColor === "function" ? nameColor() : nameColor;
    title.style.color = color ?? "#f4f7fb";
    title.style.fontWeight = "700";
    const body = document.createElement("div");
    body.textContent = typeof text === "function" ? text() : text;
    body.style.marginTop = "4px";
    body.style.color = "#d4bc82";
    body.style.whiteSpace = "pre-wrap";
    node.append(title, body);
    node.style.display = "block";
    moveTip(event);
  };
  el.addEventListener("pointerenter", show);
  el.addEventListener("pointermove", moveTip);
  el.addEventListener("pointerleave", hideTip);
}

export function tipBox(): HTMLElement {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "dungeon-tip";
  tip.style.position = "fixed";
  tip.style.zIndex = "30";
  tip.style.display = "none";
  tip.style.maxWidth = "320px";
  tip.style.padding = "8px 10px";
  tip.style.pointerEvents = "none";
  tip.style.font = "14px Palatino Linotype, Palatino, serif";
  document.body.append(tip);
  return tip;
}

export function moveTip(event: PointerEvent): void {
  const node = tipBox();
  const width = node.offsetWidth || 320;
  const height = node.offsetHeight || 80;
  const x = Math.min(Math.max(8, event.clientX + 14), window.innerWidth - width - 8);
  const y = Math.min(Math.max(8, event.clientY + 16), window.innerHeight - height - 8);
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

export function hideTip(): void {
  if (tip) tip.style.display = "none";
}
