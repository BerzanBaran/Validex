"use client";

import { useEffect, useRef, useState } from "react";

export function HeroTicketScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    async function mount() {
      const THREE = await import("three");
      if (disposed || !host) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      } catch {
        return; // The CSS ticket remains visible when WebGL is unavailable.
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(0, 0, 10);
      const light = new THREE.DirectionalLight(0xffffff, 3);
      light.position.set(-3, 5, 8);
      scene.add(new THREE.AmbientLight(0xffffff, 2.1), light);

      const ticket = new THREE.Group();
      scene.add(ticket);
      const shape = new THREE.Shape();
      const width = 3.35;
      const height = 4.65;
      const radius = 0.32;
      shape.moveTo(-width / 2 + radius, -height / 2);
      shape.lineTo(width / 2 - radius, -height / 2);
      shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius);
      shape.lineTo(width / 2, height / 2 - radius);
      shape.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
      shape.lineTo(-width / 2 + radius, height / 2);
      shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius);
      shape.lineTo(-width / 2, -height / 2 + radius);
      shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);

      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.055, bevelSize: 0.055, bevelSegments: 3, curveSegments: 8 });
      const canvas = document.createElement("canvas");
      canvas.width = 700;
      canvas.height = 970;
      const ctx = canvas.getContext("2d");
      if (!ctx) { renderer.dispose(); renderer.domElement.remove(); return; }
      ctx.fillStyle = "#ffbd9f";
      ctx.fillRect(0, 0, 700, 970);
      ctx.fillStyle = "#f36f4c";
      ctx.beginPath();
      ctx.arc(560, 215, 240, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f9e8cb";
      ctx.beginPath();
      ctx.arc(560, 215, 161, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#472a3b";
      ctx.font = "bold 32px Arial";
      ctx.fillText("validex.", 60, 93);
      ctx.font = "bold 24px Arial";
      ctx.fillText("YERELİN İYİ HALİ", 60, 540);
      ctx.font = "bold 110px Arial";
      ctx.fillText("GÜZEL", 52, 652);
      ctx.fillText("ANLAR", 52, 765);
      ctx.fillStyle = "#f36f4c";
      ctx.fillRect(0, 822, 700, 148);
      ctx.fillStyle = "#472a3b";
      ctx.font = "bold 31px Arial";
      ctx.fillText("01 / 03", 58, 909);
      ctx.fillText("↗", 605, 909);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.repeat.set(1 / width, 1 / height);
      texture.offset.set(0.5, 0.5);
      const front = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0 });
      const side = new THREE.MeshStandardMaterial({ color: 0xe98671, roughness: 0.8 });
      const back = new THREE.MeshStandardMaterial({ color: 0xffdabd, roughness: 0.8 });
      ticket.add(new THREE.Mesh(geometry, [front, side, back]));

      const coinGeometry = new THREE.TorusGeometry(0.65, 0.15, 12, 48);
      const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xf0b34c, metalness: 0.3, roughness: 0.38 });
      const ring = new THREE.Mesh(coinGeometry, coinMaterial);
      ring.position.set(2.55, -1.25, -0.8);
      ring.rotation.y = 0.45;
      scene.add(ring);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20), new THREE.MeshStandardMaterial({ color: 0x674058, roughness: 0.5 }));
      dot.position.set(-2.15, 1.9, 0.3);
      scene.add(dot);

      const resize = () => {
        const { width: w, height: h } = host.getBoundingClientRect();
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.position.z = w < 500 ? 11.8 : 9.4;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        renderer.render(scene, camera);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      setReady(true);

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let frame = 0;
      let running = true;
      const animate = (time: number) => {
        if (!running) return;
        ticket.rotation.set(-0.11 + Math.sin(time * 0.00035) * 0.045, -0.26 + Math.sin(time * 0.00048) * 0.12, -0.12 + Math.sin(time * 0.00031) * 0.035);
        ticket.position.y = Math.sin(time * 0.0007) * 0.12;
        ring.rotation.z = time * 0.0004;
        renderer.render(scene, camera);
        if (!reduceMotion.matches && !document.hidden) frame = requestAnimationFrame(animate);
      };
      if (reduceMotion.matches) {
        ticket.rotation.set(-0.11, -0.26, -0.12);
        renderer.render(scene, camera);
      } else frame = requestAnimationFrame(animate);
      const resume = () => {
        cancelAnimationFrame(frame);
        if (!document.hidden && !reduceMotion.matches) frame = requestAnimationFrame(animate);
      };
      document.addEventListener("visibilitychange", resume);
      reduceMotion.addEventListener("change", resume);
      cleanup = () => {
        running = false;
        cancelAnimationFrame(frame);
        document.removeEventListener("visibilitychange", resume);
        reduceMotion.removeEventListener("change", resume);
        observer.disconnect();
        geometry.dispose();
        coinGeometry.dispose();
        ring.geometry.dispose();
        dot.geometry.dispose();
        front.dispose(); side.dispose(); back.dispose(); coinMaterial.dispose();
        (dot.material as InstanceType<typeof THREE.MeshStandardMaterial>).dispose();
        texture.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    void mount().catch(() => {});
    return () => { disposed = true; cleanup(); };
  }, []);

  return <div className={`hero3d ${ready ? "isReady" : ""}`} ref={hostRef} aria-hidden="true"><div className="hero3dFallback"><span>validex.</span><strong>GÜZEL<br />ANLAR</strong><small>01 / 03 ↗</small></div></div>;
}
