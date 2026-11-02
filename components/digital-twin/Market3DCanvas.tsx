"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useSim } from "@/lib/sim-context";
import { C } from "@/lib/engine";
import {
  RotateCcw,
  Maximize2,
  Eye,
  SunMedium,
  BatteryCharging,
  Layers,
  Store,
  Info,
  Wifi,
} from "lucide-react";
import { SelectedComponent } from "../ComponentInspector";

interface Market3DCanvasProps {
  onSelectComponent: (component: SelectedComponent | null) => void;
  selectedComponent: SelectedComponent | null;
}

export function Market3DCanvas({ onSelectComponent, selectedComponent }: Market3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, mode } = useSim();

  // Keep references to Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Dynamic mesh refs for state updates
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const canopyMeshRef = useRef<THREE.Mesh | null>(null);
  const socLedMeshRef = useRef<THREE.Mesh | null>(null);
  const gridPylonLightRef = useRef<THREE.PointLight | null>(null);
  const stallStatusMeshesRef = useRef<THREE.Mesh[]>([]);
  const mistParticlesRef = useRef<THREE.Points | null>(null);
  const flowParticlesRef = useRef<THREE.Points | null>(null);
  const anemometerRotorRef = useRef<THREE.Group | null>(null);

  // Raycasting interactables
  const interactablesRef = useRef<Array<{ mesh: THREE.Object3D; data: SelectedComponent }>>([]);
  const hoveredObjectRef = useRef<THREE.Object3D | null>(null);

  // Camera transition target
  const cameraTargetRef = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);

  // Hover state for tooltip overlay
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    title: string;
    sub: string;
  } | null>(null);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1017); // Dark navy/slate digital twin theme
    scene.fog = new THREE.FogExp2(0x0a1017, 0.015);
    sceneRef.current = scene;

    // 2. Camera: Isometric-like high perspective
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 300);
    camera.position.set(24, 20, 24);
    camera.lookAt(0, 1.2, 0);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;

    // 4. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.08; // don't dip below ground
    controls.minDistance = 8;
    controls.maxDistance = 65;
    controls.target.set(0, 1.2, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.6);
    sunLight.position.set(15, 25, 15);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 80;
    sunLight.shadow.camera.left = -18;
    sunLight.shadow.camera.right = 18;
    sunLight.shadow.camera.top = 18;
    sunLight.shadow.camera.bottom = -18;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Secondary subtle blue fill light from opposite angle
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
    fillLight.position.set(-20, 10, -20);
    scene.add(fillLight);

    // ==========================================
    // 6. BUILD 3D MARKET DIGITAL TWIN GEOMETRY
    // ==========================================

    const interactables: Array<{ mesh: THREE.Object3D; data: SelectedComponent }> = [];

    // A. Ground Base & Market Pavement
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // dark slate
      roughness: 0.85,
      metalness: 0.15,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Subtle isometric architectural grid
    const gridHelper = new THREE.GridHelper(50, 50, 0x00f2fe, 0x1e293b);
    gridHelper.position.y = 0.01;
    (gridHelper.material as THREE.Material).opacity = 0.18;
    (gridHelper.material as THREE.Material).transparent = true;
    scene.add(gridHelper);

    // Central Walkway Pavement
    const walkwayGeo = new THREE.BoxGeometry(7, 0.08, 22);
    const walkwayMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
    });
    const walkway = new THREE.Mesh(walkwayGeo, walkwayMat);
    walkway.position.set(0, 0.04, 0);
    walkway.receiveShadow = true;
    scene.add(walkway);

    // B. Overhead Solar Canopy Structure (12 kW Array)
    const canopyGroup = new THREE.Group();

    // 6 Steel Support Columns
    const columnGeo = new THREE.CylinderGeometry(0.12, 0.14, 5, 12);
    const columnMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // steel
      metalness: 0.8,
      roughness: 0.3,
    });

    const colPositions = [
      [-3.2, 2.5, -9],
      [3.2, 2.5, -9],
      [-3.2, 2.5, 0],
      [3.2, 2.5, 0],
      [-3.2, 2.5, 9],
      [3.2, 2.5, 9],
    ];

    colPositions.forEach(([x, y, z]) => {
      const col = new THREE.Mesh(columnGeo, columnMat);
      col.position.set(x, y, z);
      col.castShadow = true;
      col.receiveShadow = true;
      canopyGroup.add(col);

      // Concrete footing
      const footGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.3, 12);
      const footMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(x, 0.15, z);
      canopyGroup.add(foot);
    });

    // Cross Truss Beams
    const beamGeo = new THREE.BoxGeometry(7.2, 0.15, 0.15);
    [-9, 0, 9].forEach((z) => {
      const beam = new THREE.Mesh(beamGeo, columnMat);
      beam.position.set(0, 5, z);
      beam.castShadow = true;
      canopyGroup.add(beam);
    });

    // Longitudinal Rafters
    const rafterGeo = new THREE.BoxGeometry(0.12, 0.12, 19);
    [-3.2, -1.1, 1.1, 3.2].forEach((x) => {
      const rafter = new THREE.Mesh(rafterGeo, columnMat);
      rafter.position.set(x, 5.1, 0);
      rafter.castShadow = true;
      canopyGroup.add(rafter);
    });

    // 24 Photovoltaic Solar Panels in a continuous canopy
    const pvPanelWidth = 3.2;
    const pvPanelLength = 19;
    const pvGeo = new THREE.BoxGeometry(pvPanelWidth * 2 + 0.4, 0.08, pvPanelLength);
    const pvMat = new THREE.MeshStandardMaterial({
      color: 0x0f2b48, // dark crystalline solar blue
      roughness: 0.2,
      metalness: 0.85,
      emissive: 0x00f2fe,
      emissiveIntensity: 0.15,
    });
    const canopyPV = new THREE.Mesh(pvGeo, pvMat);
    canopyPV.position.set(0, 5.2, 0);
    canopyPV.castShadow = true;
    canopyPV.receiveShadow = true;
    canopyGroup.add(canopyPV);
    canopyMeshRef.current = canopyPV;

    // Sub-modules grid visual lines on the PV array
    const pvWireMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, opacity: 0.4, transparent: true });
    for (let i = -8; i <= 8; i += 2) {
      const pts = [
        new THREE.Vector3(-3.4, 5.25, i),
        new THREE.Vector3(3.4, 5.25, i),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(lineGeo, pvWireMat);
      canopyGroup.add(line);
    }

    // Canopy Environmental Weather Station Mast & Sensors
    const wsGroup = new THREE.Group();
    wsGroup.position.set(0, 5.25, 0);

    const mastGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.2, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, roughness: 0.2 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.y = 0.6;
    wsGroup.add(mast);

    // SHT31 Radiation Shield (multi-plate white discs)
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (let s = 0; s < 4; s++) {
      const discGeo = new THREE.CylinderGeometry(0.14 - s * 0.01, 0.16 - s * 0.01, 0.03, 12);
      const disc = new THREE.Mesh(discGeo, shieldMat);
      disc.position.y = 0.45 + s * 0.05;
      wsGroup.add(disc);
    }

    // Tipping bucket rain gauge collector
    const rainGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.18, 12);
    const rainMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 });
    const rainCollector = new THREE.Mesh(rainGeo, rainMat);
    rainCollector.position.set(0.22, 0.7, 0);
    wsGroup.add(rainCollector);

    // Pyranometer solar radiation dome
    const pyranoGeo = new THREE.SphereGeometry(0.06, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const pyranoMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9 });
    const pyranometer = new THREE.Mesh(pyranoGeo, pyranoMat);
    pyranometer.position.set(-0.22, 0.7, 0);
    wsGroup.add(pyranometer);

    // Rotating Anemometer Assembly on top
    const anemRotor = new THREE.Group();
    anemRotor.position.set(0, 1.2, 0);
    const crossBarGeo = new THREE.BoxGeometry(0.36, 0.02, 0.02);
    const crossBar1 = new THREE.Mesh(crossBarGeo, mastMat);
    const crossBar2 = new THREE.Mesh(crossBarGeo, mastMat);
    crossBar2.rotation.y = Math.PI / 2;
    anemRotor.add(crossBar1);
    anemRotor.add(crossBar2);
    const cupGeo = new THREE.SphereGeometry(0.035, 8, 8, 0, Math.PI);
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3 });
    const cup1 = new THREE.Mesh(cupGeo, cupMat);
    cup1.position.set(0.18, 0, 0);
    cup1.rotation.z = Math.PI / 2;
    const cup2 = new THREE.Mesh(cupGeo, cupMat);
    cup2.position.set(-0.18, 0, 0);
    cup2.rotation.z = -Math.PI / 2;
    anemRotor.add(cup1);
    anemRotor.add(cup2);
    wsGroup.add(anemRotor);
    anemometerRotorRef.current = anemRotor;

    // Glowing IoT telemetry LED beacon
    const wsLedGeo = new THREE.SphereGeometry(0.07, 8, 8);
    const wsLedMat = new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00f2fe, emissiveIntensity: 1.2 });
    const wsLed = new THREE.Mesh(wsLedGeo, wsLedMat);
    wsLed.position.set(0, 0.85, 0.1);
    wsGroup.add(wsLed);

    canopyGroup.add(wsGroup);

    scene.add(canopyGroup);

    // Register Canopy as interactable
    interactables.push({
      mesh: canopyPV,
      data: {
        type: "canopy",
        id: "solar_canopy",
        name: "12 kW Bifacial Solar Canopy",
      },
    });

    // Register Weather Station as interactable
    interactables.push({
      mesh: wsLed,
      data: {
        type: "sensor",
        id: "canopy_weather_station",
        name: "Canopy Environmental Weather Station",
        sensorData: {
          sensorType: "Weather Hub",
          model: "SHT31 + BH1750 + Rain Gauge + Anemometer",
          value: "32.0°C | 62% RH | 820 W/m²",
          unit: "",
          status: "simulated",
          source: "simulated",
          timestamp: new Date().toISOString(),
          location: "Solar Canopy Central Mast",
          calibrationStatus: "Factory calibrated ±0.2°C, ±1.5% RH",
        },
      },
    });

    // C. 8 Vendor Stalls (2 rows of 4 stalls along the walkway)
    const stallColors = [
      0x10b981, // 1. Vegetables (fresh emerald)
      0xf97316, // 2. Fruits (citrus orange)
      0xeab308, // 3. Flowers (marigold yellow)
      0x38bdf8, // 4. Dairy (cool sky blue)
      0xec4899, // 5. Spices (ruby saffron)
      0xa855f7, // 6. Snacks (purple treats)
      0xd97706, // 7. Tea / Chai (warm amber chai)
      0x84cc16, // 8. Grains (golden harvest)
    ];

    const stallZPositions = [-6.75, -2.25, 2.25, 6.75];
    const stallNames = [
      "Ramesh Fresh Greens",
      "Priya Exotic Fruits",
      "Anand Marigold Blooms",
      "Kaveri Dairy & Milk",
      "Kerala Spices Depot",
      "Lakshmi Hot Snacks",
      "Chai Point Junction",
      "Annapurna Grains & Pulses",
    ];

    const stallStatusMeshes: THREE.Mesh[] = [];

    for (let i = 0; i < 8; i++) {
      const isWest = i % 2 === 0;
      const rowIdx = Math.floor(i / 2);
      const posX = isWest ? -2.2 : 2.2;
      const posZ = stallZPositions[rowIdx];

      const stallGroup = new THREE.Group();
      stallGroup.position.set(posX, 0, posZ);

      // Stall wooden table base
      const counterGeo = new THREE.BoxGeometry(1.6, 0.9, 2.8);
      const counterMat = new THREE.MeshStandardMaterial({
        color: 0x3f2e27, // dark teak wood
        roughness: 0.7,
      });
      const counter = new THREE.Mesh(counterGeo, counterMat);
      counter.position.y = 0.45;
      counter.castShadow = true;
      counter.receiveShadow = true;
      stallGroup.add(counter);

      // Vendor Awning canopy
      const awningGeo = new THREE.BoxGeometry(1.7, 0.1, 2.9);
      const awningMat = new THREE.MeshStandardMaterial({
        color: stallColors[i],
        roughness: 0.4,
      });
      const awning = new THREE.Mesh(awningGeo, awningMat);
      awning.position.set(0, 2.2, 0);
      awning.rotation.z = isWest ? 0.08 : -0.08;
      awning.castShadow = true;
      stallGroup.add(awning);

      // Stall posts
      const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x64748b });
      [
        [-0.7, 1.5, -1.3],
        [0.7, 1.5, -1.3],
        [-0.7, 1.5, 1.3],
        [0.7, 1.5, 1.3],
      ].forEach(([px, py, pz]) => {
        const p = new THREE.Mesh(postGeo, postMat);
        p.position.set(px, py, pz);
        stallGroup.add(p);
      });

      // Crates of goods
      const crateGeo = new THREE.BoxGeometry(0.4, 0.25, 0.6);
      const crateMat = new THREE.MeshStandardMaterial({
        color: stallColors[i],
        roughness: 0.5,
      });
      for (let c = -0.8; c <= 0.8; c += 0.8) {
        const crate = new THREE.Mesh(crateGeo, crateMat);
        crate.position.set(0, 1.05, c);
        crate.castShadow = true;
        stallGroup.add(crate);
      }

      // Overhead Status Indicator Orb
      const statusOrbGeo = new THREE.SphereGeometry(0.12, 16, 16);
      const statusOrbMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.8,
      });
      const statusOrb = new THREE.Mesh(statusOrbGeo, statusOrbMat);
      statusOrb.position.set(0, 2.45, 0);
      stallGroup.add(statusOrb);
      stallStatusMeshes.push(statusOrb);

      // Stall-level ESP32 IoT Sensor Node Box
      const sensorBoxGeo = new THREE.BoxGeometry(0.14, 0.2, 0.1);
      const sensorBoxMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
      const sensorBox = new THREE.Mesh(sensorBoxGeo, sensorBoxMat);
      sensorBox.position.set(isWest ? 0.76 : -0.76, 1.4, -1.25);
      sensorBox.castShadow = true;
      stallGroup.add(sensorBox);

      // Mini IoT LED indicator
      const sensorLedGeo = new THREE.SphereGeometry(0.035, 8, 8);
      const sensorLedMat = new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00f2fe, emissiveIntensity: 1.2 });
      const sensorLed = new THREE.Mesh(sensorLedGeo, sensorLedMat);
      sensorLed.position.set(isWest ? 0.76 : -0.76, 1.45, -1.18);
      stallGroup.add(sensorLed);

      // Probe wire going down to produce crates
      const probeGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.45, 6);
      const probeMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
      const probe = new THREE.Mesh(probeGeo, probeMat);
      probe.position.set(isWest ? 0.76 : -0.76, 1.15, -1.2);
      stallGroup.add(probe);

      scene.add(stallGroup);

      // Register as interactable
      interactables.push({
        mesh: counter,
        data: {
          type: "stall",
          id: `stall_${i}`,
          name: stallNames[i],
          stallIndex: i,
        },
      });

      // Register Stall IoT Sensor as interactable
      interactables.push({
        mesh: sensorBox,
        data: {
          type: "sensor",
          id: `sensor_stall_${i}`,
          name: `${stallNames[i]} — IoT Environmental Node`,
          stallIndex: i,
          sensorData: {
            sensorType: "Produce Storage & Surface Probe",
            model: "ESP32-WROOM + SHT31 + DS18B20",
            value: "28.5°C | 68% RH",
            unit: "",
            status: "simulated",
            source: "simulated",
            timestamp: new Date().toISOString(),
            location: `${stallNames[i]} Pillar Node`,
            calibrationStatus: "DS18B20 surface probe calibrated",
          },
        },
      });
    }

    stallStatusMeshesRef.current = stallStatusMeshes;

    // D. Central Energy Hub (BESS Battery + Inverter Station)
    const hubGroup = new THREE.Group();
    hubGroup.position.set(-8.5, 0, 0);

    // Concrete Pad
    const padGeo = new THREE.BoxGeometry(3.5, 0.2, 5.5);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = 0.1;
    pad.receiveShadow = true;
    hubGroup.add(pad);

    // 1. LiFePO4 BESS Battery Cabinet
    const bessGeo = new THREE.BoxGeometry(1.6, 2.4, 2.2);
    const bessMat = new THREE.MeshStandardMaterial({
      color: 0x0f3a40, // teal brand color
      metalness: 0.5,
      roughness: 0.35,
    });
    const bessCabinet = new THREE.Mesh(bessGeo, bessMat);
    bessCabinet.position.set(-0.6, 1.3, -1.2);
    bessCabinet.castShadow = true;
    bessCabinet.receiveShadow = true;
    hubGroup.add(bessCabinet);

    // Glowing LED SOC Bar on BESS front
    const socGeo = new THREE.BoxGeometry(0.08, 1.6, 0.15);
    const socMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.2,
    });
    const socLed = new THREE.Mesh(socGeo, socMat);
    socLed.position.set(0.21, 1.3, -1.2);
    hubGroup.add(socLed);
    socLedMeshRef.current = socLed;

    // 2. Hybrid Inverter & Cold Storage Unit
    const invGeo = new THREE.BoxGeometry(1.4, 2.0, 1.8);
    const invMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.3,
    });
    const inverter = new THREE.Mesh(invGeo, invMat);
    inverter.position.set(-0.6, 1.1, 1.3);
    inverter.castShadow = true;
    inverter.receiveShadow = true;
    hubGroup.add(inverter);

    // Inverter digital screen
    const screenGeo = new THREE.BoxGeometry(0.04, 0.4, 0.7);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x00f2fe,
      emissive: 0x00f2fe,
      emissiveIntensity: 0.9,
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0.12, 1.4, 1.3);
    hubGroup.add(screen);

    scene.add(hubGroup);

    // Register BESS & Inverter as interactables
    interactables.push({
      mesh: bessCabinet,
      data: {
        type: "battery",
        id: "bess_storage",
        name: "20 kWh LiFePO4 BESS Station",
      },
    });

    interactables.push({
      mesh: inverter,
      data: {
        type: "inverter",
        id: "hybrid_inverter",
        name: "15 kVA Hybrid Microgrid Inverter",
      },
    });

    // E. Utility Grid Substation / Pylon Connection
    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(15, 0, 0);

    // Pylon Lattice Post
    const pylonPoleGeo = new THREE.CylinderGeometry(0.2, 0.35, 9, 8);
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.8,
      roughness: 0.2,
    });
    const pylonPole = new THREE.Mesh(pylonPoleGeo, pylonMat);
    pylonPole.position.y = 4.5;
    pylonPole.castShadow = true;
    pylonGroup.add(pylonPole);

    // Pylon Crossarm
    const crossGeo = new THREE.BoxGeometry(0.2, 0.2, 4);
    const cross = new THREE.Mesh(crossGeo, pylonMat);
    cross.position.y = 8;
    pylonGroup.add(cross);

    // Substation Transformer Box
    const transGeo = new THREE.BoxGeometry(1.8, 1.6, 1.8);
    const transMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
    const transformer = new THREE.Mesh(transGeo, transMat);
    transformer.position.y = 0.9;
    transformer.castShadow = true;
    pylonGroup.add(transformer);

    // Grid Status Indicator Beacon
    const gridBeaconGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const gridBeaconMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.0,
    });
    const gridBeacon = new THREE.Mesh(gridBeaconGeo, gridBeaconMat);
    gridBeacon.position.set(0, 8.5, 0);
    pylonGroup.add(gridBeacon);

    const gridPylonLight = new THREE.PointLight(0x10b981, 1.5, 10);
    gridPylonLight.position.set(0, 8.5, 0);
    pylonGroup.add(gridPylonLight);
    gridPylonLightRef.current = gridPylonLight;

    // Power transmission wire curve connecting pylon to microgrid hub
    const cableCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(15, 7.8, 0),
      new THREE.Vector3(5, 4.5, 0),
      new THREE.Vector3(-4, 4.8, 0)
    );
    const cableGeo = new THREE.TubeGeometry(cableCurve, 32, 0.03, 8, false);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const cableMesh = new THREE.Mesh(cableGeo, cableMat);
    scene.add(cableMesh);

    scene.add(pylonGroup);

    // Register Grid as interactable
    interactables.push({
      mesh: transformer,
      data: {
        type: "grid",
        id: "grid_substation",
        name: "11 kV Utility Grid Feeder & Meter",
      },
    });

    interactablesRef.current = interactables;

    // F. Animated Energy Flow Particle Stream
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    // Create particle paths (solar canopy -> inverter -> stalls/battery/grid)
    for (let p = 0; p < particleCount; p++) {
      positions[p * 3] = (Math.random() - 0.5) * 8;
      positions[p * 3 + 1] = Math.random() * 4 + 0.5;
      positions[p * 3 + 2] = (Math.random() - 0.5) * 16;

      colors[p * 3] = 0.0;
      colors[p * 3 + 1] = 0.95;
      colors[p * 3 + 2] = 1.0;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });

    const flowParticles = new THREE.Points(particleGeo, particleMat);
    scene.add(flowParticles);
    flowParticlesRef.current = flowParticles;

    // G. Misting Evaporative Particles
    const mistCount = 150;
    const mistGeo = new THREE.BufferGeometry();
    const mistPos = new Float32Array(mistCount * 3);
    for (let m = 0; m < mistCount; m++) {
      mistPos[m * 3] = (Math.random() - 0.5) * 5;
      mistPos[m * 3 + 1] = Math.random() * 2 + 1.2;
      mistPos[m * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    mistGeo.setAttribute("position", new THREE.BufferAttribute(mistPos, 3));

    const mistMat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    const mistParticles = new THREE.Points(mistGeo, mistMat);
    scene.add(mistParticles);
    mistParticlesRef.current = mistParticles;

    // ==========================================
    // 7. ANIMATION RENDER LOOP
    // ==========================================
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();
      controls.update();

      // Smooth camera transition if active
      if (cameraTargetRef.current) {
        camera.position.lerp(cameraTargetRef.current.pos, 0.06);
        controls.target.lerp(cameraTargetRef.current.look, 0.06);
        if (camera.position.distanceTo(cameraTargetRef.current.pos) < 0.1) {
          cameraTargetRef.current = null;
        }
      }

      // Animate energy flow particles
      if (flowParticlesRef.current) {
        const posAttr = flowParticlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const colAttr = flowParticlesRef.current.geometry.attributes.color as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const carr = colAttr.array as Float32Array;

        for (let i = 0; i < particleCount; i++) {
          arr[i * 3 + 1] -= 0.03; // fall or flow
          if (arr[i * 3 + 1] < 0.3) {
            arr[i * 3 + 1] = 4.8;
            arr[i * 3] = (Math.random() - 0.5) * 6;
            arr[i * 3 + 2] = (Math.random() - 0.5) * 16;
          }
        }
        posAttr.needsUpdate = true;
      }

      // Animate mist particles drifting
      if (mistParticlesRef.current) {
        const mistPosAttr = mistParticlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const marr = mistPosAttr.array as Float32Array;
        for (let m = 0; m < mistCount; m++) {
          marr[m * 3 + 1] -= 0.015;
          if (marr[m * 3 + 1] < 0.2) {
            marr[m * 3 + 1] = 2.4;
          }
        }
        mistPosAttr.needsUpdate = true;
      }

      // Animate anemometer cups rotation
      if (anemometerRotorRef.current) {
        anemometerRotorRef.current.rotation.y += 0.04;
      }

      renderer.render(scene, camera);
    };

    animate();

    // ==========================================
    // 8. RESIZE & CLEANUP
    // ==========================================
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  // Update Three.js elements when simulation state changes
  useEffect(() => {
    if (!sceneRef.current) return;

    const hour = state.hour;
    const isDay = hour >= 6 && hour <= 18;
    const hsun = state.last?.hsun ?? 0;
    const genKw = state.last?.genKw ?? 0;
    const soc = state.soc;
    const gridLive = state.gridLive;

    // 1. Sun Position & Lighting: Arc across sky from East (x = 25) to West (x = -25)
    if (sunLightRef.current && ambientLightRef.current) {
      if (isDay) {
        // Solar elevation: peaks at hour 12
        const solarProgress = (hour - 6) / 12; // 0 at 6am, 0.5 at 12pm, 1 at 6pm
        const sunAngle = solarProgress * Math.PI; // 0 to PI
        const sunX = Math.cos(sunAngle) * 25;
        const sunY = Math.sin(sunAngle) * 22 + 4;
        const sunZ = Math.sin(solarProgress * Math.PI * 0.8) * 12 + 6;

        sunLightRef.current.position.set(sunX, sunY, sunZ);

        // Sunlight color warmth: dawn/dusk amber, midday pure white
        const warmth = 1 - Math.sin(sunAngle); // 1 at dawn/dusk, 0 at midday
        const sunColor = new THREE.Color().lerpColors(
          new THREE.Color(0xfffaed),
          new THREE.Color(0xf5a623),
          warmth * 0.6
        );
        sunLightRef.current.color = sunColor;
        sunLightRef.current.intensity = Math.max(0.2, hsun * 1.8);

        // Ambient daylight
        ambientLightRef.current.intensity = gridLive ? 0.45 : 0.2;
      } else {
        // Night: Cool moonlight
        sunLightRef.current.position.set(-15, 18, -15);
        sunLightRef.current.color = new THREE.Color(0x38bdf8);
        sunLightRef.current.intensity = 0.2;
        ambientLightRef.current.intensity = gridLive ? 0.25 : 0.08;
      }

      // Heatwave effect: slight warm amber ambient cast
      if (state.heatwave) {
        ambientLightRef.current.color = new THREE.Color(0xffe8d6);
      } else {
        ambientLightRef.current.color = new THREE.Color(0xffffff);
      }
    }

    // 2. Solar Canopy Photovoltaic Glow
    if (canopyMeshRef.current) {
      const mat = canopyMeshRef.current.material as THREE.MeshStandardMaterial;
      if (mat) {
        if (genKw > 0) {
          mat.emissive = new THREE.Color(0x00f2fe);
          mat.emissiveIntensity = Math.min(1.0, 0.15 + (genKw / C.P_CAP) * 0.85);
        } else {
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0;
        }
      }
    }

    // 3. Battery SOC Bar height & color
    if (socLedMeshRef.current) {
      const scaleY = Math.max(0.05, soc);
      socLedMeshRef.current.scale.set(1, scaleY, 1);
      const socMat = socLedMeshRef.current.material as THREE.MeshStandardMaterial;
      if (socMat) {
        const socColor =
          soc > 0.5 ? 0x10b981 : soc > 0.2 ? 0xf5a623 : 0xef4444;
        socMat.color.setHex(socColor);
        socMat.emissive.setHex(socColor);
      }
    }

    // 4. Grid Substation Beacon
    if (gridPylonLightRef.current) {
      if (gridLive) {
        gridPylonLightRef.current.color.setHex(0x10b981);
        gridPylonLightRef.current.intensity = 1.5;
      } else {
        // Blackout: red flashing emergency light
        gridPylonLightRef.current.color.setHex(0xef4444);
        gridPylonLightRef.current.intensity = 3.0;
      }
    }

    // 5. Update 8 Stall Status Orbs
    stallStatusMeshesRef.current.forEach((mesh, idx) => {
      const stall = state.stalls[idx];
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat || !stall) return;

      if (stall.status === "ok") {
        mat.color.setHex(0x10b981);
        mat.emissive.setHex(0x10b981);
      } else if (stall.status === "amber") {
        mat.color.setHex(0xf5a623);
        mat.emissive.setHex(0xf5a623);
      } else {
        // shed
        mat.color.setHex(0xef4444);
        mat.emissive.setHex(0xef4444);
      }
    });

    // 6. Misting visibility
    if (mistParticlesRef.current) {
      mistParticlesRef.current.visible = Boolean(state.last?.coolingKw && state.last.coolingKw > 0);
    }
  }, [state]);

  // Raycasting on Mouse Move & Click
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !cameraRef.current || !sceneRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const meshes = interactablesRef.current.map((item) => item.mesh);
    const intersects = raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      canvasRef.current.style.cursor = "pointer";
      let hitMesh = intersects[0].object;
      while (hitMesh.parent && !interactablesRef.current.some((i) => i.mesh === hitMesh)) {
        hitMesh = hitMesh.parent;
      }

      const found = interactablesRef.current.find((i) => i.mesh === hitMesh);
      if (found) {
        setHoverInfo({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          title: found.data.name,
          sub: "Click to inspect real-time telemetry",
        });
      }
    } else {
      canvasRef.current.style.cursor = "default";
      setHoverInfo(null);
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !cameraRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const meshes = interactablesRef.current.map((item) => item.mesh);
    const intersects = raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      let hitMesh = intersects[0].object;
      while (hitMesh.parent && !interactablesRef.current.some((i) => i.mesh === hitMesh)) {
        hitMesh = hitMesh.parent;
      }

      const found = interactablesRef.current.find((i) => i.mesh === hitMesh);
      if (found) {
        onSelectComponent(found.data);
      }
    }
  }, [onSelectComponent]);

  // Camera preset views
  const setCameraView = (type: "hero" | "top" | "canopy" | "battery" | "alleys" | "weather") => {
    if (type === "hero") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(24, 20, 24),
        look: new THREE.Vector3(0, 1.2, 0),
      };
    } else if (type === "top") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(0.1, 35, 0.1),
        look: new THREE.Vector3(0, 0, 0),
      };
    } else if (type === "canopy") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(10, 11, 14),
        look: new THREE.Vector3(0, 5.2, 0),
      };
    } else if (type === "weather") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(5, 9, 5),
        look: new THREE.Vector3(0, 5.8, 0),
      };
    } else if (type === "battery") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(-14, 6, -3),
        look: new THREE.Vector3(-8.5, 1.2, 0),
      };
    } else if (type === "alleys") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(0, 2.5, 14),
        look: new THREE.Vector3(0, 1.5, -4),
      };
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[460px] bg-[#0a1017] overflow-hidden select-none">
      {/* 3D Canvas */}
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        className="w-full h-full block touch-none"
      />

      {/* Floating Tooltip */}
      {hoverInfo && (
        <div
          className="absolute pointer-events-none z-20 px-2.5 py-1.5 rounded-lg bg-card/90 border border-teal/40 backdrop-blur-md shadow-xl text-xs -translate-x-1/2 -translate-y-12"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
        >
          <div className="font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
            {hoverInfo.title}
          </div>
          <div className="text-[10px] text-muted-foreground">{hoverInfo.sub}</div>
        </div>
      )}

      {/* Top Overlay Badge & Telemetry Bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="px-3 py-1.5 rounded-lg border border-border/70 bg-card/85 backdrop-blur-md shadow-lg flex items-center gap-2 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-green animate-pulse" />
          <span className="font-serif font-bold text-foreground">3D Digital Twin Active</span>
          <span className="text-[10px] font-mono text-muted-foreground border-l border-border pl-2">
            Bengaluru Market Microgrid
          </span>
        </div>

        {!state.gridLive && (
          <div className="px-3 py-1.5 rounded-lg border border-red/60 bg-red/15 text-red backdrop-blur-md shadow-lg flex items-center gap-1.5 text-xs font-bold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red" />
            ISLANDED MICROGRID MODE
          </div>
        )}
      </div>

      {/* Camera View Presets Toolbar */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 p-1 rounded-xl border border-border/70 bg-card/85 backdrop-blur-md shadow-lg">
        <button
          onClick={() => setCameraView("hero")}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
          title="Isometric View"
        >
          <Eye className="w-3.5 h-3.5 text-teal" />
          <span>Isometric</span>
        </button>
        <button
          onClick={() => setCameraView("top")}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
          title="Top-Down Plan"
        >
          <Layers className="w-3.5 h-3.5 text-teal" />
          <span>Top Plan</span>
        </button>
        <button
          onClick={() => setCameraView("canopy")}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
          title="Solar Canopy Focus"
        >
          <SunMedium className="w-3.5 h-3.5 text-amber" />
          <span>Canopy</span>
        </button>
        <button
          onClick={() => setCameraView("weather")}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
          title="IoT Weather Hub Focus"
        >
          <Wifi className="w-3.5 h-3.5 text-blue" />
          <span>Weather Hub</span>
        </button>
        <button
          onClick={() => setCameraView("battery")}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
          title="BESS Storage Focus"
        >
          <BatteryCharging className="w-3.5 h-3.5 text-green" />
          <span>BESS Hub</span>
        </button>
        <button
          onClick={() => setCameraView("alleys")}
          className="px-2.5 py-1 text-[11px] font-medium rounded-lg text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
          title="Stall Walkway Focus"
        >
          <Store className="w-3.5 h-3.5 text-purple" />
          <span>Stalls</span>
        </button>
        <div className="w-[1px] h-4 bg-border mx-0.5" />
        <button
          onClick={() => setCameraView("hero")}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Reset View"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Orbit Helper Tip */}
      <div className="absolute bottom-3 right-3 z-10 px-2.5 py-1 rounded-md bg-card/60 backdrop-blur-xs border border-border/40 text-[10px] font-mono text-muted-foreground flex items-center gap-1.5">
        <Info className="w-3 h-3 text-muted-foreground" />
        <span>Drag to orbit • Scroll to zoom • Click assets to inspect</span>
      </div>
    </div>
  );
}
