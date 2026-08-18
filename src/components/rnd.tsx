import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type Position = { x: number; y: number };
type Size = { width: number | string; height: number | string };

type DragData = Position;
type ResizeRef = HTMLDivElement & { offsetWidth: number; offsetHeight: number };

export interface RndProps extends Omit<HTMLAttributes<HTMLDivElement>, "onDragStart"> {
  children?: ReactNode;
  bounds?: "parent" | string;
  position?: Position;
  size?: Size;
  minWidth?: number | string;
  minHeight?: number | string;
  onDragStart?: (event: PointerEvent, data: DragData) => void;
  onDragStop?: (event: PointerEvent, data: DragData) => void;
  onResizeStart?: (event: PointerEvent) => void;
  onResizeStop?: (
    event: PointerEvent,
    direction: string,
    ref: ResizeRef,
    delta: { width: number; height: number },
    position: Position,
  ) => void;
}

function numberValue(value: number | string | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parentBounds(element: HTMLDivElement | null) {
  const parent = element?.parentElement;
  if (!parent) return { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY };
  const rect = parent.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

export function Rnd({
  children,
  position = { x: 0, y: 0 },
  size = { width: 100, height: 60 },
  minWidth = 20,
  minHeight = 20,
  bounds,
  onDragStart,
  onDragStop,
  onResizeStart,
  onResizeStop,
  className,
  style,
  onPointerDown,
  ...rest
}: RndProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [livePosition, setLivePosition] = useState(position);
  const [liveSize, setLiveSize] = useState({
    width: numberValue(size.width, 100),
    height: numberValue(size.height, 60),
  });

  useEffect(() => setLivePosition(position), [position.x, position.y]);
  useEffect(
    () => setLiveSize({ width: numberValue(size.width, 100), height: numberValue(size.height, 60) }),
    [size.width, size.height],
  );

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-rnd-resize-handle]")) return;
    if (target.closest("button,a,input,textarea,select")) return;

    event.preventDefault();
    const nativeStart = event.nativeEvent;
    const startPointer = { x: event.clientX, y: event.clientY };
    const startPosition = { ...livePosition };
    const currentSize = { ...liveSize };
    onDragStart?.(nativeStart, startPosition);

    const move = (moveEvent: PointerEvent) => {
      const limits = bounds === "parent" ? parentBounds(rootRef.current) : undefined;
      const maxX = limits ? Math.max(0, limits.width - currentSize.width) : Number.POSITIVE_INFINITY;
      const maxY = limits ? Math.max(0, limits.height - currentSize.height) : Number.POSITIVE_INFINITY;
      setLivePosition({
        x: Math.max(0, Math.min(maxX, startPosition.x + moveEvent.clientX - startPointer.x)),
        y: Math.max(0, Math.min(maxY, startPosition.y + moveEvent.clientY - startPointer.y)),
      });
    };

    const stop = (stopEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      const limits = bounds === "parent" ? parentBounds(rootRef.current) : undefined;
      const maxX = limits ? Math.max(0, limits.width - currentSize.width) : Number.POSITIVE_INFINITY;
      const maxY = limits ? Math.max(0, limits.height - currentSize.height) : Number.POSITIVE_INFINITY;
      const next = {
        x: Math.max(0, Math.min(maxX, startPosition.x + stopEvent.clientX - startPointer.x)),
        y: Math.max(0, Math.min(maxY, startPosition.y + stopEvent.clientY - startPointer.y)),
      };
      setLivePosition(next);
      onDragStop?.(stopEvent, next);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const nativeStart = event.nativeEvent;
    const startPointer = { x: event.clientX, y: event.clientY };
    const startSize = { ...liveSize };
    const startPosition = { ...livePosition };
    const minimumWidth = numberValue(minWidth, 20);
    const minimumHeight = numberValue(minHeight, 20);
    onResizeStart?.(nativeStart);

    const resizeTo = (clientX: number, clientY: number) => {
      const limits = bounds === "parent" ? parentBounds(rootRef.current) : undefined;
      const maxWidth = limits
        ? Math.max(minimumWidth, limits.width - startPosition.x)
        : Number.POSITIVE_INFINITY;
      const maxHeight = limits
        ? Math.max(minimumHeight, limits.height - startPosition.y)
        : Number.POSITIVE_INFINITY;
      return {
        width: Math.max(
          minimumWidth,
          Math.min(maxWidth, startSize.width + clientX - startPointer.x),
        ),
        height: Math.max(
          minimumHeight,
          Math.min(maxHeight, startSize.height + clientY - startPointer.y),
        ),
      };
    };

    const move = (moveEvent: PointerEvent) => setLiveSize(resizeTo(moveEvent.clientX, moveEvent.clientY));
    const stop = (stopEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      const nextSize = resizeTo(stopEvent.clientX, stopEvent.clientY);
      setLiveSize(nextSize);
      const ref = rootRef.current as ResizeRef | null;
      if (ref) {
        onResizeStop?.(
          stopEvent,
          "bottomRight",
          ref,
          { width: nextSize.width - startSize.width, height: nextSize.height - startSize.height },
          startPosition,
        );
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const mergedStyle: CSSProperties = {
    ...style,
    position: "absolute",
    left: livePosition.x,
    top: livePosition.y,
    width: liveSize.width,
    height: liveSize.height,
    touchAction: "none",
  };

  return (
    <div
      ref={rootRef}
      className={className}
      style={mergedStyle}
      onPointerDown={beginDrag}
      {...rest}
    >
      {children}
      <div
        data-rnd-resize-handle
        aria-hidden="true"
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize touch-none"
        onPointerDown={beginResize}
      />
    </div>
  );
}

export default Rnd;
