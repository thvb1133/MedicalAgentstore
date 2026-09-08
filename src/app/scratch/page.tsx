"use client";

// Scratch harness for eyeballing the warp at a fixed expression. Not linked
// from anywhere and deleted before this lands.

import { useEffect, useRef } from "react";

import { getRig } from "@/lib/avatar/faceRig";
import { buildScene, drawPresenter } from "@/components/avatar/renderPresenter";

export default function Scratch() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("avatar") ?? "vikram";
    const jaw = Number(params.get("jaw") ?? 0);
    const spread = Number(params.get("spread") ?? 0);
    const blink = Number(params.get("blink") ?? 0);

    const rig = getRig(id);
    const canvas = ref.current;
    if (!rig || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scene = buildScene(rig);
    const image = new Image();
    image.src = `/portraits/${id}.photo.webp`;
    image.onload = () => {
      const dpr = 2;
      canvas.width = 900 * dpr;
      canvas.height = 675 * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPresenter(
        ctx,
        scene,
        image,
        { jaw, spread, blink },
        { dx: 0, dy: 0, tilt: 0, scale: 1 },
        900,
        675,
      );
      document.body.dataset.drawn = "yes";
    };
  }, []);

  return <canvas ref={ref} style={{ width: 900, height: 675 }} />;
}
