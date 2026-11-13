export function element<T extends Element>(
  selector: string,
  type: abstract new (...args: never[]) => T,
): T {
  const result = document.querySelector(selector);
  if (!(result instanceof type))
    throw new Error(`Missing element: ${selector}`);
  return result;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  return context;
}
