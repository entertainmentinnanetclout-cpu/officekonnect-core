import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type Position = { x: number; y: number };
type Size = { width: number; height: number };
type Frame = Position & Size;

type Interaction = {
  kind: "drag" | "resize";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startFrame: Frame;
};

export type RndProps = Omit<HTMLAttributes<HTMLDivElement>, "onDragStart" | "onDragEnd"> & {
  bounds?: "parent" | string;
  size: Size;
  position: Position;
  minWidth?: number;
  minHeight?: number;
  children?: ReactNode;
  onDragStart?: (event: PointerEvent) => void;
  onDragStop?: (event: PointerEvent, data: Position) => void;
  onResizeStart?: (event: PointerEvent) => void;
  onResizeStop?: (
    event: PointerEvent,
    direction: "bottomRight",
    ref: HTMLDivElement,
    delta: Size,
    position: Position,
  ) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * SSR-safe, pointer-event implementation of the react-rnd subset OfficeKonnect uses.
 * It deliberately avoids the legacy CommonJS/class helper chain that breaks the
 * TanStack/Lovable SSR bundle while preserving the controlled Rnd API used by the
 * signing and PDF signature-placement surfaces.
 */
export function Rnd({
  bounds,
  size,
  position,
  minWidth = 20,
  minHeight = 20,
  onDragStart,
  onDragStop,
  onResizeStart,
  onResizeStop,
  children,
  className,
  style,
  onPointerDown,
  ...rest
}: RndProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const frameRef = useRef<Frame>({ ...position, ...size });
  const [frame, setFrameState] = useState<Frame>({ ...position, ...size });

  const updateFrame = useCallback((next: Frame) => {
    frameRef.current = next;
    setFrameState(next);
  }, []);

  useEffect(() => {
    if (interactionRef.current) return;
    updateFrame({ ...position, ...size });
  }, [position.x, position.y, size.width, size.height, updateFrame]);

  useEffect(() => {
    const parentSize = () => {
      if (bounds !== "parent") return null;
      const parent = elementRef.current?.parentElement;
      if (!parent) return null;
      return { width: parent.clientWidth, height: parent.clientHeight };
    };

    const handleMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) return;

      const dx = event.clientX - interaction.startClientX;
      const dy = event.clientY - interaction.startClientY;
      const parent = parentSize();

      if (interaction.kind === "drag") {
        const maxX = parent
          ? Math.max(0, parent.width - interaction.startFrame.width)
          : Number.POSITIVE_INFINITY;
        const maxY = parent
          ? Math.max(0, parent.height - interaction.startFrame.height)
          : Number.POSITIVE_INFINITY;
        updateFrame({
          ...interaction.startFrame,
          x: clamp(interaction.startFrame.x + dx, 0, maxX),
          y: clamp(interaction.startFrame.y + dy, 0, maxY),
        });
        return;
      }

      const maxWidth = parent
        ? Math.max(minWidth, parent.width - interaction.startFrame.x)
        : Number.POSITIVE_INFINITY;
      const maxHeight = parent
        ? Math.max(minHeight, parent.height - interaction.startFrame.y)
        : Number.POSITIVE_INFINITY;
      updateFrame({
        ...interaction.startFrame,
        width: clamp(interaction.startFrame.width + dx, minWidth, maxWidth),
        height: clamp(interaction.startFrame.height + dy, minHeight, maxHeight),
      });
    };

    const handleUp = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) return;
      interactionRef.current = null;
      const current = frameRef.current;

      if (interaction.kind === "drag") {
        onDragStop?.(event, { x: current.x, y: current.y });
      } else if (elementRef.current) {
        onResizeStop?.(
          event,
          "bottomRight",
          elementRef.current,
          {
            width: current.width - interaction.startFrame.width,
            height: current.height - interaction.startFrame.height,
          },
          { x: current.x, y: current.y },
        );
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [bounds, minHeight, minWidth, onDragStop, onResizeStop, updateFrame]);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-rnd-resize-handle]")) return;
    interactionRef.current = {
      kind: "drag",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFrame: frameRef.current,
    };
    onDragStart?.(event.nativeEvent);
  };

  const beginResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = {
      kind: "resize",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFrame: frameRef.current,
    };
    onResizeStart?.(event.nativeEvent);
  };

  return (
    <div
      {...rest}
      ref={elementRef}
      className={className}
      onPointerDown={beginDrag}
      style={{
        ...style,
        position: "absolute",
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
        touchAction: "none",
      }}
    >
      {children}
      <span
        data-rnd-resize-handle
        aria-hidden="true"
        onPointerDown={beginResize}
        className="absolute -bottom-1 -right-1 z-50 h-3 w-3 cursor-se-resize rounded-sm border border-current bg-background/90 shadow-sm"
      />
    </div>
  );
}
