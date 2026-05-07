"use client";
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface SensorData {
  fingers: number[];
  rotation: { x: number; y: number; z: number };
}

export default function SimpleHand3D({ sensorData }: { sensorData: SensorData | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const handGroupRef = useRef<THREE.Group | null>(null);
  const fingerGroupsRef = useRef<THREE.Group[]>([]);
  const animationIdRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeToContainer = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    const cleanupRef = { current: undefined as undefined | (() => void) };

    const initIfNeeded = () => {
      if (initializedRef.current) {
        resizeToContainer();
        return;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      // Initialize scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      sceneRef.current = scene;

      // Initialize camera (use a safe default ratio first; ResizeObserver will correct it later)
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      camera.position.set(0, 2, 8);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      // Initialize renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Initial size setup
      resizeToContainer();

      // Create lights
      createLights(scene);

      // Create hand model
      const handGroup = new THREE.Group();
      scene.add(handGroup);
      handGroupRef.current = handGroup;
      createSimpleHandModel(handGroup);

      // Add event listeners and save cleanup function
      const cleanupEventListeners = addEventListeners(renderer.domElement, handGroup, camera);

      // Start animation loop
      animate();

      // Mark initialization complete, and clean up on unmount
      initializedRef.current = true;
      cleanupRef.current = () => {
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
        }
        if (rendererRef.current) {
          rendererRef.current.dispose();
          if (containerRef.current && rendererRef.current.domElement.parentElement === containerRef.current) {
            containerRef.current.removeChild(rendererRef.current.domElement);
          }
        }
        if (cleanupEventListeners) {
          cleanupEventListeners();
        }
      };
    };

    // Use ResizeObserver so container size changes (e.g. sidebar toggle) are also handled correctly
    const ro = new ResizeObserver(() => {
      initIfNeeded();
      resizeToContainer();
    });
    ro.observe(container);
    resizeObserverRef.current = ro;

    // If the initial render already has a size, try to initialize immediately
    initIfNeeded();

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      initializedRef.current = false;
    };
  }, []);

  // On initialization, set fingers to extended state so palm and fingers are on the same horizontal plane
  useEffect(() => {
    if (handGroupRef.current && fingerGroupsRef.current.length === 5) {
      console.log('Initializing 3D hand model to extended state');

      // Adjust overall hand rotation so palm and fingers are on the same horizontal plane
      handGroupRef.current.rotation.x = 0; // reset X axis rotation
      handGroupRef.current.rotation.y = 0; // reset Y axis rotation
      handGroupRef.current.rotation.z = 0; // reset Z axis rotation

      // Set all fingers to extended state (bend = 0)
      for (let i = 0; i < 5; i++) {
        updateFingerBending(i, 0);
      }

      console.log('Palm and fingers set to the same horizontal plane');
    }
  }, [handGroupRef.current, fingerGroupsRef.current]);

  useEffect(() => {
    console.log('SimpleHand3D received sensorData:', sensorData);
    if (sensorData && handGroupRef.current) {
      console.log('Updating 3D hand model with data:', {
        fingers: sensorData.fingers,
        rotation: sensorData.rotation
      });

      // Check for reset signal (all fingers are 0)
      const isResetSignal = sensorData.fingers.every(value => value === 0);

      if (isResetSignal) {
        console.log('Reset signal received, re-initializing 3D model');

        // Reset hand rotation to horizontal plane
        handGroupRef.current.rotation.x = 0;
        handGroupRef.current.rotation.y = 0;
        handGroupRef.current.rotation.z = 0;

        // Reset all fingers to extended state
        for (let i = 0; i < 5; i++) {
          updateFingerBending(i, 0);
        }

        console.log('3D model reset to extended state, palm and fingers on the same horizontal plane');
      } else {
        // Normal finger bend update (value is now the bend amount; 0=extended, positive=bent)
        sensorData.fingers.forEach((value, index) => {
          if (index < 5 && fingerGroupsRef.current[index]) {
            console.log(`Updating finger ${index} to bend value ${value}`);
            updateFingerBending(index, value);
          }
        });

        // Update hand rotation
        console.log('Updating hand rotation:', sensorData.rotation);
        updateHandRotation(sensorData.rotation);
      }
    } else {
      console.log('Cannot update 3D hand:', {
        hasSensorData: !!sensorData,
        hasHandGroup: !!handGroupRef.current
      });
    }
  }, [sensorData]);

  const createLights = (scene: THREE.Scene) => {
    // Soft ambient light
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x1a1a1a, 0.6);
    scene.add(hemi);

    // Key light
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(6, 8, 6);
    key.castShadow = true;
    scene.add(key);

    // Cool fill light
    const cool = new THREE.DirectionalLight(0x4a90e2, 0.7);
    cool.position.set(-6, 3, 4);
    scene.add(cool);

    // Rim backlight
    const rim = new THREE.DirectionalLight(0xffa366, 0.4);
    rim.position.set(-2, 2, -6);
    scene.add(rim);
  };

  interface FingerConfig {
    name: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
    position: [number, number, number];
    scale: number;
    baseRotation?: [number, number, number]; // x, y, z in radians
  }

  const createSimpleHandModel = (handGroup: THREE.Group) => {
    // Create palm
    const palmGeometry = new THREE.BoxGeometry(3.2, 0.8, 4.2);
    const palmMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x6b7280,
      metalness: 0.9,
      roughness: 0.25,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3
    });
    const palm = new THREE.Mesh(palmGeometry, palmMaterial);
    palm.position.set(0, 0, 0);
    palm.castShadow = true;
    palm.receiveShadow = true;
    handGroup.add(palm);

    // Palm edge lines (mechanical style outline)
    const palmEdges = new THREE.EdgesGeometry(palmGeometry);
    const palmLine = new THREE.LineSegments(
      palmEdges,
      new THREE.LineBasicMaterial({ color: 0x2c3540, linewidth: 1 })
    );
    palm.add(palmLine);

    // Wrist base
    const wristGeom = new THREE.CylinderGeometry(1.2, 1.2, 1.0, 24);
    const wristMat = new THREE.MeshPhysicalMaterial({
      color: 0x4b5563,
      metalness: 0.85,
      roughness: 0.3
    });
    const wrist = new THREE.Mesh(wristGeom, wristMat);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.set(0, 0, -2.6);
    wrist.castShadow = true;
    handGroup.add(wrist);

    // Create 5 fingers (left hand logic: finger1=thumb, finger2=index, finger3=middle, finger4=ring, finger5=pinky)
    // Fix: all fingers on the same horizontal plane as palm, initial state is extended
    const fingerConfigs: FingerConfig[] = [
      // baseRotation: [x, y, z] - set to Math.PI/2 to ensure same horizontal plane as palm and correct bend direction
      // Left-hand layout (viewer facing dorsal/back of left hand): pinky on the left, thumb on the right
      { name: 'thumb',  position: [1.9, 0, 0.6], scale: 0.9,  baseRotation: [Math.PI / 2, 0, -0.6] }, // finger1: thumb - on right side, spread angle tilts inward toward palm
      { name: 'index',  position: [0.9, 0, 2.1], scale: 1.0,  baseRotation: [Math.PI / 2, 0, 0] },    // finger2: index - next to thumb
      { name: 'middle', position: [0,   0, 2.2], scale: 1.1,  baseRotation: [Math.PI / 2, 0, 0] },    // finger3: middle - centered
      { name: 'ring',   position: [-0.9, 0, 2.1], scale: 0.97, baseRotation: [Math.PI / 2, 0, 0] },   // finger4: ring
      { name: 'pinky',  position: [-1.7, 0, 1.8], scale: 0.82, baseRotation: [Math.PI / 2, 0, 0.1] }  // finger5: pinky - leftmost, slight outward tilt
    ];

    fingerGroupsRef.current = [];
    fingerConfigs.forEach((config, index) => {
      const fingerGroup = createFinger(config, index);
      fingerGroup.position.set(config.position[0], config.position[1], config.position[2]);
      fingerGroup.scale.setScalar(config.scale);
      // Base direction (parallel/tilt angle between palm and finger)
      if (config.baseRotation) {
        fingerGroup.rotation.set(config.baseRotation[0], config.baseRotation[1], config.baseRotation[2]);
      }
      fingerGroupsRef.current.push(fingerGroup);
      handGroup.add(fingerGroup);
    });
  };

  const createFinger = (config: FingerConfig, fingerIndex: number) => {
    const fingerGroup = new THREE.Group();
    // MCP, PIP, DIP joint sizes
    const jointSizes = [
      { length: 1.0, radius: 0.16 }, // MCP -> proximal phalanx
      { length: 0.85, radius: 0.13 }, // PIP -> intermediate phalanx
      { length: 0.65, radius: 0.11 } // DIP -> distal phalanx
    ];

    let currentY = 0;
    let parent: THREE.Group = fingerGroup;

    jointSizes.forEach((joint, jointIndex) => {
      // Joint pivot (hierarchical chain for linked movement)
      const jointPivot = new THREE.Group();
      jointPivot.position.y = currentY;
      parent.add(jointPivot);

      // Phalanx mesh
      const jointGeometry = new THREE.CylinderGeometry(
        joint.radius, joint.radius * 0.92, joint.length, 16
      );
      const jointMaterial = new THREE.MeshPhysicalMaterial({
        color: jointIndex === 0 ? 0x6b7280 : 0x4b5563,
        metalness: 0.9,
        roughness: 0.25,
        emissive: 0x0a0f14,
        emissiveIntensity: 0.15
      });
      const jointMesh = new THREE.Mesh(jointGeometry, jointMaterial);
      jointMesh.position.y = joint.length / 2;
      jointMesh.castShadow = true;
      jointMesh.receiveShadow = true;
      jointPivot.add(jointMesh);

      // Edge lines to enhance mechanical feel
      const edges = new THREE.EdgesGeometry(jointGeometry);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x1f2933 })
      );
      jointMesh.add(line);

      // Joint decorative ring (glowing)
      const ring = new THREE.TorusGeometry(joint.radius * 0.95, 0.03, 8, 32);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x4cc3ff, emissive: 0x1a9fff, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.4 });
      const ringMesh = new THREE.Mesh(ring, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 0.02;
      jointPivot.add(ringMesh);

      // Next layer parent is the current pivot
      parent = jointPivot;
      currentY += joint.length;
    });

    return fingerGroup;
  };

  const updateFingerBending = (fingerIndex: number, value: number) => {
    if (fingerIndex < 0 || fingerIndex >= 5) return;
    const finger = fingerGroupsRef.current[fingerIndex];
    if (!finger) return;

    // value is already the bend amount (0=extended, positive=bent)
    // Map the bend value to 0-1 range; assume max bend is 300
    const maxBendValue = 300; // adjust based on actual conditions
    const t = THREE.MathUtils.clamp(value / maxBendValue, 0, 1);
    const eased = t * t * (3 - 2 * t); // smoothstep

    // Angle limits (radians)
    const isThumb = fingerIndex === 0;
    const maxMCP = isThumb ? THREE.MathUtils.degToRad(50) : THREE.MathUtils.degToRad(70);
    const maxPIP = isThumb ? THREE.MathUtils.degToRad(60) : THREE.MathUtils.degToRad(100);
    const maxDIP = isThumb ? THREE.MathUtils.degToRad(45) : THREE.MathUtils.degToRad(65);

    const mcpAngle = eased * maxMCP;
    const pipAngle = eased * maxPIP;
    const dipAngle = (eased * maxDIP);

    // finger structure: hierarchical joints [MCP, PIP, DIP]
    // Fix: use negative angle so fingers bend inward on the horizontal plane
    if (finger.children && finger.children.length >= 1) {
      const mcpPivot = finger.children[0] as THREE.Group;
      mcpPivot.rotation.x = -mcpAngle;

      if (mcpPivot.children && mcpPivot.children.length >= 1) {
        const pipPivot = mcpPivot.children.find(c => c.type === 'Group') as THREE.Group | undefined;
        if (pipPivot) {
          pipPivot.rotation.x = -pipAngle;

          const dipPivot = (pipPivot.children || []).find(c => c.type === 'Group') as THREE.Group | undefined;
          if (dipPivot) {
            dipPivot.rotation.x = -dipAngle;
          }
        }
      }
    }
  };

  const updateHandRotation = (rotation: { x: number; y: number; z: number }) => {
    if (!handGroupRef.current) return;
    
    // Smooth rotation update
    handGroupRef.current.rotation.x = THREE.MathUtils.lerp(
      handGroupRef.current.rotation.x, rotation.x, 0.1
    );
    handGroupRef.current.rotation.y = THREE.MathUtils.lerp(
      handGroupRef.current.rotation.y, rotation.y, 0.1
    );
    handGroupRef.current.rotation.z = THREE.MathUtils.lerp(
      handGroupRef.current.rotation.z, rotation.z, 0.1
    );
  };

  const addEventListeners = (
    canvas: HTMLCanvasElement,
    handGroup: THREE.Group,
    camera: THREE.PerspectiveCamera
  ) => {
    // Mouse control
    let isMouseDown = false;
    let mouseX = 0;
    let mouseY = 0;
    
    const onMouseDown = (event: MouseEvent) => {
      isMouseDown = true;
      mouseX = event.clientX;
      mouseY = event.clientY;
    };
    
    const onMouseMove = (event: MouseEvent) => {
      if (!isMouseDown || !handGroup) return;
      
      const deltaX = event.clientX - mouseX;
      const deltaY = event.clientY - mouseY;
      
      handGroup.rotation.y += deltaX * 0.01;
      handGroup.rotation.x += deltaY * 0.01;
      
      mouseX = event.clientX;
      mouseY = event.clientY;
    };
    
    const onMouseUp = () => {
      isMouseDown = false;
    };
    
    const onWheel = (event: WheelEvent) => {
      const delta = event.deltaY * 0.001;
      camera.position.z = Math.max(3, Math.min(15, camera.position.z + delta));
    };
    
    const onResize = () => {
      if (!containerRef.current || !camera || !rendererRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel);
    window.addEventListener('resize', onResize);
    
    // Return cleanup function
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  };

  const animate = () => {
    animationIdRef.current = requestAnimationFrame(animate);
    
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  return <div ref={containerRef} className="w-full h-full min-h-[300px]" />;
}