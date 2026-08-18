import { Component, createRef } from "react";
import type {
  CanvasHTMLAttributes,
  PointerEvent as ReactPointerEvent,
} from "react";

type SignatureCanvasProps = {
  penColor?: string;
  backgroundColor?: string;
  clearOnResize?: boolean;
  canvasProps?: CanvasHTMLAttributes<HTMLCanvasElement>;
  onBegin?: () => void;
  onEnd?: () => void;
};

/**
 * SSR-safe subset of react-signature-canvas used by OfficeKonnect.
 */
export default class SignatureCanvas extends Component<SignatureCanvasProps> {
  private readonly canvasRef = createRef<HTMLCanvasElement>();
  private drawing = false;
  private empty = true;
  private resizeObserver: ResizeObserver | null = null;

  componentDidMount() {
    this.resizeCanvas();

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.props.clearOnResize === false) return;
        this.resizeCanvas();
      });

      if (this.canvasRef.current) {
        this.resizeObserver.observe(this.canvasRef.current);
      }
    }
  }

  componentDidUpdate(previousProps: SignatureCanvasProps) {
    if (
      previousProps.backgroundColor !== this.props.backgroundColor &&
      this.empty
    ) {
      this.clear();
    }
  }

  componentWillUnmount() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  public clear = () => {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = this.pixelRatio();
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();

    if (this.props.backgroundColor) {
      context.save();
      context.fillStyle = this.props.backgroundColor;
      context.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);
      context.restore();
    }

    this.empty = true;
  };

  public isEmpty = () => this.empty;

  public getCanvas = () => {
    const canvas = this.canvasRef.current;
    if (!canvas) throw new Error("Signature canvas is unavailable");
    return canvas;
  };

  private pixelRatio() {
    if (typeof window === "undefined") return 1;
    return Math.max(window.devicePixelRatio || 1, 1);
  }

  private resizeCanvas = () => {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const ratio = this.pixelRatio();
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === width && canvas.height === height) return;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.configureContext(context);

    if (this.props.backgroundColor) {
      context.fillStyle = this.props.backgroundColor;
      context.fillRect(0, 0, rect.width, rect.height);
    }

    this.empty = true;
  };

  private configureContext(context: CanvasRenderingContext2D) {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = this.props.penColor ?? "black";
    context.lineWidth = 2.5;
  }

  private point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    this.props.canvasProps?.onPointerDown?.(event);
    if (event.button !== 0) return;

    const context = event.currentTarget.getContext("2d");
    if (!context) return;

    this.configureContext(context);
    const { x, y } = this.point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.01, y + 0.01);
    context.stroke();

    this.drawing = true;
    this.empty = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    this.props.onBegin?.();
  };

  private handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    this.props.canvasProps?.onPointerMove?.(event);
    if (!this.drawing) return;

    const context = event.currentTarget.getContext("2d");
    if (!context) return;

    const { x, y } = this.point(event);
    context.lineTo(x, y);
    context.stroke();
  };

  private finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!this.drawing) return;

    this.drawing = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    this.props.onEnd?.();
  };

  private handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    this.props.canvasProps?.onPointerUp?.(event);
    this.finishStroke(event);
  };

  private handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    this.props.canvasProps?.onPointerCancel?.(event);
    this.finishStroke(event);
  };

  render() {
    const { canvasProps } = this.props;

    return (
      <canvas
        {...canvasProps}
        ref={this.canvasRef}
        style={{ touchAction: "none", ...canvasProps?.style }}
        onPointerDown={this.handlePointerDown}
        onPointerMove={this.handlePointerMove}
        onPointerUp={this.handlePointerUp}
        onPointerCancel={this.handlePointerCancel}
      />
    );
  }
}
