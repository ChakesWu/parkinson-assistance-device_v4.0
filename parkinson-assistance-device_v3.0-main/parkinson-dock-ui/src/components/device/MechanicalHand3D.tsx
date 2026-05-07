import * as THREE from 'three';
import { useRef, useEffect, useState } from 'react';

interface MechanicalHand3DProps {
  fingerBend?: number[];
  rotation?: { x: number; y: number; z: number };
}

const MechanicalHand3D: React.FC<MechanicalHand3DProps> = ({ 
  fingerBend = [0, 0, 0, 0, 0], 
  rotation = { x: 0, y: 0, z: 0 } 
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const handGroupRef = useRef<THREE.Group | null>(null);
  const fingerGroupsRef = useRef<THREE.Group[]>([]);
  const animationRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);

  // Create a basic geometry hand model
  const createSimpleHandModel = () => {
    if (!sceneRef.current) return;

    const handGroup = new THREE.Group();
    handGroupRef.current = handGroup;

    // Set initial hand rotation so palm and fingers are on the same horizontal plane
    handGroup.rotation.x = 0;
    handGroup.rotation.y = 0;
    handGroup.rotation.z = 0;

    // Create palm
    const palmGeometry = new THREE.BoxGeometry(3, 0.8, 4);
    const palmMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x6b7280,
      metalness: 0.7,
      roughness: 0.3
    });
    const palm = new THREE.Mesh(palmGeometry, palmMaterial);
    palm.position.set(0, 0, 0);
    palm.castShadow = true;
    palm.receiveShadow = true;
    handGroup.add(palm);

    // Create wrist
    const wristGeometry = new THREE.CylinderGeometry(1.2, 1.4, 2, 12);
    const wristMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x4b5563,
      metalness: 0.8,
      roughness: 0.25
    });
    const wrist = new THREE.Mesh(wristGeometry, wristMaterial);
    wrist.position.set(0, -1, -1.5);
    wrist.castShadow = true;
    handGroup.add(wrist);

    // Create fingers
    const fingerConfigs = [
      { name: 'thumb', position: [-1.8, 0.4, 1.2], scale: 0.8, joints: 3 },
      { name: 'index', position: [-0.9, 0.4, 2.2], scale: 1.0, joints: 3 },
      { name: 'middle', position: [0, 0.4, 2.3], scale: 1.1, joints: 3 },
      { name: 'ring', position: [0.9, 0.4, 2.2], scale: 0.95, joints: 3 },
      { name: 'pinky', position: [1.7, 0.4, 1.8], scale: 0.75, joints: 3 }
    ];

    fingerGroupsRef.current = [];
    fingerConfigs.forEach((config, index) => {
      const fingerGroup = createFinger(config);
      fingerGroup.position.set(config.position[0], config.position[1], config.position[2]);
      fingerGroup.scale.setScalar(config.scale);
      fingerGroupsRef.current.push(fingerGroup);
      handGroup.add(fingerGroup);
    });

    // Add LED lights
    const ledPositions = [
      [-1, 0.5, 0.5],
      [0, 0.5, 1],
      [1, 0.5, 0.5]
    ];
    
    ledPositions.forEach(pos => {
      const ledGeometry = new THREE.SphereGeometry(0.08, 8, 8);
      const ledMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff88,
        emissive: 0x004422,
        emissiveIntensity: 1.2
      });
      const led = new THREE.Mesh(ledGeometry, ledMaterial);
      led.position.set(pos[0], pos[1], pos[2]);
      handGroup.add(led);
    });

    sceneRef.current.add(handGroup);
    setLoading(false);
  };

  // Create a single finger
  const createFinger = (config: any) => {
    const fingerGroup = new THREE.Group();
    fingerGroup.name = config.name;
    
    const jointSizes = [
      { length: 1.0, radius: 0.15 },
      { length: 0.8, radius: 0.12 },
      { length: 0.6, radius: 0.1 }
    ];
    
    let currentY = 0;
    
    jointSizes.forEach((joint, jointIndex) => {
      // Joint body
      const jointGeometry = new THREE.CylinderGeometry(
        joint.radius, joint.radius * 0.9, joint.length, 8
      );
      const jointMaterial = new THREE.MeshPhysicalMaterial({
        color: jointIndex === 0 ? 0x6b7280 : 0x4b5563,
        metalness: 0.7,
        roughness: 0.3
      });
      
      const jointMesh = new THREE.Mesh(jointGeometry, jointMaterial);
      jointMesh.position.y = joint.length / 2;
      jointMesh.castShadow = true;
      
      // Joint group (for rotation)
      const jointPivot = new THREE.Group();
      jointPivot.position.y = currentY;
      jointPivot.add(jointMesh);
      
      // Add joint connector
      if (jointIndex < jointSizes.length - 1) {
        const connectorGeometry = new THREE.CylinderGeometry(
          joint.radius * 1.1, joint.radius * 1.1, 0.1, 8
        );
        const connectorMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x374151,
          metalness: 0.8,
          roughness: 0.2
        });
        const connector = new THREE.Mesh(connectorGeometry, connectorMaterial);
        connector.position.y = joint.length;
        jointPivot.add(connector);
      }
      
      // Add LED indicator light
      const ledGeometry = new THREE.SphereGeometry(0.04, 8, 8);
      const ledColor = jointIndex === 0 ? 0x4444ff : 0x44ff44;
      const ledMaterial = new THREE.MeshStandardMaterial({
        color: ledColor,
        emissive: ledColor,
        emissiveIntensity: 1.2
      });
      const led = new THREE.Mesh(ledGeometry, ledMaterial);
      led.position.set(joint.radius * 0.8, joint.length * 0.5, 0);
      jointPivot.add(led);
      
      // Add fingertip sensor (last joint)
      if (jointIndex === jointSizes.length - 1) {
        const tipGeometry = new THREE.SphereGeometry(joint.radius * 0.8, 8, 8);
        const tipMaterial = new THREE.MeshStandardMaterial({
          color: 0xff4444,
          emissive: 0x441111
        });
        const tip = new THREE.Mesh(tipGeometry, tipMaterial);
        tip.position.y = joint.length * 0.9;
        jointPivot.add(tip);
      }
      
      fingerGroup.add(jointPivot);
      currentY += joint.length;
    });
    
    return fingerGroup;
  };

  // Update finger bending
  const updateFingerBending = (fingerIndex: number, value: number) => {
    if (fingerIndex < 0 || fingerIndex >= 5) return;
    const fingerGroup = fingerGroupsRef.current[fingerIndex];
    if (!fingerGroup) return;

    // Now value is the bend value (0=extended, positive=bent)
    const maxBendValue = 300;
    const normalizedValue = Math.max(0, Math.min(value / maxBendValue, 1));
    const bendAngle = normalizedValue * Math.PI / 2; // 0-90 degrees
    
    // Update each joint
    fingerGroup.children.forEach((joint, jointIndex) => {
      const jointBend = bendAngle * (jointIndex + 1) / fingerGroup.children.length;
      joint.rotation.x = jointBend; // positive angle, bend on horizontal plane
    });
  };

  // Update hand rotation
  const updateHandRotation = (rot: { x: number; y: number; z: number }) => {
    if (!handGroupRef.current) return;
    
    // Smooth rotation update
    handGroupRef.current.rotation.x = THREE.MathUtils.lerp(
      handGroupRef.current.rotation.x, rot.x, 0.1
    );
    handGroupRef.current.rotation.z = THREE.MathUtils.lerp(
      handGroupRef.current.rotation.z, rot.z, 0.1
    );
    handGroupRef.current.rotation.y = rot.y;
  };

  // Initialize scene
  useEffect(() => {
    if (!mountRef.current) return;

    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    // Initialize camera
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 2, 8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Initialize renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: false
    });
    renderer.setSize(
      mountRef.current.clientWidth,
      mountRef.current.clientHeight
    );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x808080, 0.8);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    const blueLight = new THREE.DirectionalLight(0x4a90e2, 0.6);
    blueLight.position.set(-5, 3, 3);
    scene.add(blueLight);
    
    const orangeLight = new THREE.DirectionalLight(0xff8c42, 0.4);
    orangeLight.position.set(3, -2, 5);
    scene.add(orangeLight);
    
    const topLight = new THREE.DirectionalLight(0xffffff, 1.0);
    topLight.position.set(0, 10, 0);
    scene.add(topLight);
    
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.8);
    frontLight.position.set(0, 0, 10);
    scene.add(frontLight);

    // Create mechanical hand model
    createSimpleHandModel();

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      
      // Add subtle floating effect
      if (handGroupRef.current) {
        handGroupRef.current.position.y = Math.sin(Date.now() * 0.001 * 1.2) * 0.05;
      }
      
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current || !mountRef.current) return;
      cameraRef.current.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight
      );
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update finger bending
  useEffect(() => {
    fingerBend.forEach((value, index) => {
      updateFingerBending(index, value);
    });
  }, [fingerBend]);

  // Update hand rotation
  useEffect(() => {
    updateHandRotation(rotation);
  }, [rotation]);

  return (
    <div 
      ref={mountRef} 
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {loading && (
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#666',
            fontSize: '14px'
          }}
        >
          Loading mechanical hand model...
        </div>
      )}
    </div>
  );
};

export default MechanicalHand3D;