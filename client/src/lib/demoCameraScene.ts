/**
 * The sample "live view" in the integrations demo: a drawn picture of a
 * house or shopfront with a car and a person moving through it as the demo
 * clock runs. It is NOT video — it stands in for what a Milestone camera
 * would show. Pure canvas drawing, no network.
 */
import {
  DEMO_REGO,
  demoClock,
  motionX,
  type DemoCamera,
} from "@shared/integrationDemo";

export const SCENE_W = 600;
export const SCENE_H = 340;

const FONT = '"Segoe UI", Roboto, Arial, sans-serif';

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hhmmss(t: number): string {
  return demoClock(t, true);
}

function tag(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  colour: string
) {
  g.font = `700 15px ${FONT}`;
  const w = g.measureText(text).width + 12;
  g.fillStyle = colour;
  g.fillRect(x, y - 20, w, 20);
  g.fillStyle = "#fff";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(text, x + 6, y - 9.5);
}

/** Draw the camera's picture at demo time `t` into a 600 × 340 canvas. */
export function drawDemoScene(
  g: CanvasRenderingContext2D,
  cam: DemoCamera,
  t: number
): void {
  const w = SCENE_W;
  const h = SCENE_H;
  const sky = g.createLinearGradient(0, 0, 0, h * 0.5);
  sky.addColorStop(0, "#b7d4ec");
  sky.addColorStop(1, "#e9f2f9");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h * 0.5);
  g.fillStyle = cam.kind === "Residence" ? "#9cc08a" : "#bdb9ae";
  g.fillRect(0, h * 0.5, w, h * 0.5);
  g.fillStyle = "#6b7280";
  g.fillRect(0, h * 0.78, w, h * 0.22);
  g.fillStyle = "#9ca3af";
  g.fillRect(0, h * 0.76, w, h * 0.025);
  g.setLineDash([26, 20]);
  g.strokeStyle = "#e5e7eb";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, h * 0.9);
  g.lineTo(w, h * 0.9);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = "#cfcac0";
  g.fillRect(w * 0.28, h * 0.5, w * 0.34, h * 0.265);

  if (cam.kind === "Residence") {
    g.fillStyle = "#e7d8c4";
    g.fillRect(w * 0.66, h * 0.2, w * 0.32, h * 0.32);
    g.fillStyle = "#9a5b43";
    g.beginPath();
    g.moveTo(w * 0.64, h * 0.2);
    g.lineTo(w * 0.82, h * 0.06);
    g.lineTo(w * 1.0, h * 0.2);
    g.closePath();
    g.fill();
    g.fillStyle = "#7c5a3c";
    g.fillRect(w * 0.78, h * 0.34, w * 0.07, h * 0.18);
    g.fillStyle = "#a9c9e3";
    g.fillRect(w * 0.88, h * 0.3, w * 0.07, h * 0.1);
    g.fillRect(w * 0.68, h * 0.3, w * 0.07, h * 0.1);
  } else {
    g.fillStyle = "#d9dee6";
    g.fillRect(w * 0.5, h * 0.16, w * 0.5, h * 0.36);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i % 2 ? "#ffffff" : "#c2410c";
      g.fillRect(w * 0.5 + i * w * 0.05, h * 0.3, w * 0.05, h * 0.07);
    }
    g.fillStyle = "#1b2333";
    g.font = `700 18px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(cam.sign ?? "", w * 0.75, h * 0.23);
    g.fillStyle = "#a9c9e3";
    g.fillRect(w * 0.54, h * 0.4, w * 0.16, h * 0.12);
    g.fillRect(w * 0.84, h * 0.4, w * 0.12, h * 0.12);
    g.fillStyle = "#7c5a3c";
    g.fillRect(w * 0.73, h * 0.38, w * 0.08, h * 0.14);
  }

  const carX = motionX(cam.car, t);
  if (carX != null) {
    const x = carX * w;
    const by = h * 0.72;
    g.fillStyle = "#f3f4f6";
    roundRect(g, x - 62, by - 38, 124, 34, 9);
    g.fill();
    g.fillStyle = "#94a3b8";
    roundRect(g, x - 36, by - 54, 72, 22, 8);
    g.fill();
    g.fillStyle = "#334155";
    g.beginPath();
    g.arc(x - 38, by - 4, 11, 0, 6.3);
    g.arc(x + 38, by - 4, 11, 0, 6.3);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "#e11d48";
    g.strokeRect(x - 72, by - 64, 144, 70);
    tag(g, x - 72, by - 64, `Vehicle ${DEMO_REGO}`, "#e11d48");
  }
  const personX = motionX(cam.person, t);
  if (personX != null) {
    const x = personX * w;
    const by = h * 0.66;
    g.fillStyle = "#1e3a8a";
    roundRect(g, x - 8, by - 34, 16, 28, 5);
    g.fill();
    g.fillStyle = "#e0b090";
    g.beginPath();
    g.arc(x, by - 42, 8, 0, 6.3);
    g.fill();
    g.fillStyle = "#334155";
    g.fillRect(x - 7, by - 6, 5, 16);
    g.fillRect(x + 2, by - 6, 5, 16);
    g.lineWidth = 3;
    g.strokeStyle = "#0d9488";
    g.strokeRect(x - 18, by - 56, 36, 72);
    tag(g, x - 18, by - 56, "Person 1", "#0d9488");
  }

  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(8, 8, 190, 26);
  g.fillStyle = "#fff";
  g.font = `700 15px ${FONT}`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(`${cam.name}   ${hhmmss(t)}`, 16, 21.5);
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(w - 96, h - 32, 88, 24);
  g.fillStyle = "#fcd34d";
  g.font = `700 13px ${FONT}`;
  g.textAlign = "center";
  g.fillText("SAMPLE", w - 52, h - 19.5);
}
