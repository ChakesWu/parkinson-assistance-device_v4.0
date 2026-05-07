import * as THREE from 'three';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

class Hand3D {
    container: HTMLElement;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    handModel: THREE.Group | null;
    mixer: THREE.AnimationMixer | null;
    bones: { [key: string]: any };
    animationId: number | null;
    fingerData: number[];
    imuData: {
        accelerometer: { x: number; y: number; z: number };
        gyroscope: { x: number; y: number; z: number };
        magnetometer: { x: number; y: number; z: number };
    };
    dynamicLights: THREE.SpotLight[];

    constructor(container: HTMLElement) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.handModel = null;
        this.mixer = null;
        this.bones = {};
        this.animationId = null;
        this.fingerData = [0, 0, 0, 0, 0];
        this.imuData = {
            accelerometer: { x: 0, y: 0, z: 0 },
            gyroscope: { x: 0, y: 0, z: 0 },
            magnetometer: { x: 0, y: 0, z: 0 }
        };
        this.dynamicLights = [];
        
        this.init();
    }
    
    init() {
        this.createScene();
        this.createCamera();
        this.createRenderer();
        this.createLights();
        this.loadHandModel();
        this.addEventListeners();
        this.animate();
    }
    
    createScene() {
        this.scene = new THREE.Scene();
        
        // Create background
        this.scene.background = new THREE.Color(0x0a0a0a);
        
        // Add ground
        const groundGeometry = new THREE.PlaneGeometry(20, 20);
        const groundMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0.3
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -3;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }
    
    createCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        this.camera.position.set(0, 0, 5);
    }
    
    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Enable shadows
        // @ts-ignore
        this.renderer.shadowMap.enabled = true;
        // @ts-ignore
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Enhance rendering (removed deprecated properties)
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        
        this.container.appendChild(this.renderer.domElement);
    }
    
    createLights() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x2a3f5f, 0.3);
        this.scene!.add(ambientLight);
        
        // Main directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(8, 10, 6);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 4096;
        directionalLight.shadow.mapSize.height = 4096;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -12;
        directionalLight.shadow.camera.right = 12;
        directionalLight.shadow.camera.top = 12;
        directionalLight.shadow.camera.bottom = -12;
        directionalLight.shadow.bias = -0.0001;
        this.scene!.add(directionalLight);
        
        // Blue tech light
        const techLight = new THREE.DirectionalLight(0x4a90e2, 0.8);
        techLight.position.set(-8, 5, 4);
        this.scene!.add(techLight);
        
        // Orange warm light
        const warmLight = new THREE.DirectionalLight(0xff8c42, 0.4);
        warmLight.position.set(6, 3, -4);
        this.scene!.add(warmLight);
        
        // Top ambient light
        const skyLight = new THREE.HemisphereLight(0x87ceeb, 0x2f4f4f, 0.6);
        this.scene!.add(skyLight);
        
        // Rim backlight
        const rimLight = new THREE.DirectionalLight(0x00ffff, 0.5);
        rimLight.position.set(0, 8, -12);
        this.scene!.add(rimLight);
        
        // Bottom fill light
        const bottomLight = new THREE.DirectionalLight(0x6a5acd, 0.3);
        bottomLight.position.set(0, -5, 8);
        this.scene!.add(bottomLight);
        
        // Add dynamic lighting effects
        this.createDynamicLights();
    }
    
    createDynamicLights() {
        // Create dynamically rotating coloured light sources
        const spotLight1 = new THREE.SpotLight(0xff0080, 1, 15, Math.PI * 0.1);
        spotLight1.position.set(5, 8, 5);
        spotLight1.target.position.set(0, 0, 0);
        this.scene!.add(spotLight1);
        this.scene!.add(spotLight1.target);
        
        const spotLight2 = new THREE.SpotLight(0x0080ff, 1, 15, Math.PI * 0.1);
        spotLight2.position.set(-5, 8, 5);
        spotLight2.target.position.set(0, 0, 0);
        this.scene!.add(spotLight2);
        this.scene!.add(spotLight2.target);
        
        // Store dynamic lights for use in animation
        this.dynamicLights = [spotLight1, spotLight2];
    }
    
    loadHandModel() {
        // Check if GLTFLoader is available
        // @ts-ignore
        if (typeof GLTFLoader === 'undefined') {
            console.error('GLTFLoader not loaded, using fallback model');
            this.createFallbackModel();
            return;
        }
        
        const loader = new GLTFLoader();
        
        loader.load(
            '/models/hand_model.glb',
            (gltf) => {
                this.handModel = gltf.scene;
                
                // Set model properties
                this.handModel.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                // Set model scale and position (left hand display)
                this.handModel.scale.set(2, 2, 2);
                this.handModel.position.set(0, -1, 0);

                // Set initial hand rotation so palm and fingers are on the same horizontal plane
                this.handModel.rotation.x = 0;
                this.handModel.rotation.y = 0;
                this.handModel.rotation.z = 0;

                // Ensure it displays as a left hand (if GLB is already left hand, no mirroring needed)
                // Note: if GLB is already a left hand, mirroring is not needed
                // this.handModel.scale.x = -2; // Uncomment to mirror X axis
                
                // If animations exist, set up animation mixer
                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(this.handModel);
                }
                
                // Collect bone references
                this.collectBones();
                
                this.scene?.add(this.handModel);
                
                console.log('3D hand model loaded successfully');
            },
            undefined,
            (error) => {
                console.error('Failed to load 3D model:', error);
                // Fall back to programmatic model on load failure
                this.createFallbackModel();
            }
        );
    }
    
    collectBones() {
        if (!this.handModel) return;
        
        // Collect finger bones by actual bone names (left hand logic: thumb to pinky)
        const fingerBonePatterns = [
            // finger1: thumb (left hand)
            ['thumb.01.L', 'thumb.02.L', 'thumb.03.L'],
            // finger2: index (left hand)
            ['finger_index.01.L', 'finger_index.02.L', 'finger_index.03.L'],
            // finger3: middle (left hand)
            ['finger_middle.01.L', 'finger_middle.02.L', 'finger_middle.03.L'],
            // finger4: ring (left hand)
            ['finger_ring.01.L', 'finger_ring.02.L', 'finger_ring.03.L'],
            // finger5: pinky (left hand)
            ['finger_pinky.01.L', 'finger_pinky.02.L', 'finger_pinky.03.L']
        ];
        
        this.handModel.traverse((child) => {
            if (child instanceof THREE.Bone || child.type === 'Bone') {
                const boneName = child.name;
                
                // Try to match finger bones
                fingerBonePatterns.forEach((fingerBones, fingerIndex) => {
                    fingerBones.forEach((expectedName, jointIndex) => {
                        if (boneName === expectedName) {
                            if (!this.bones[fingerIndex]) {
                                this.bones[fingerIndex] = [];
                            }
                            this.bones[fingerIndex][jointIndex] = child;
                        }
                    });
                });
                
                // Also save all bones for debugging
                this.bones[boneName] = child;
            }
        });
    }
    
    createFallbackModel() {
        // If GLB load fails, create a simplified hand model
        this.handModel = new THREE.Group();
        
        // Create palm
        this.createPalm();
        
        // Create five fingers
        this.createFingers();
        
        this.scene?.add(this.handModel);
        
        console.log('Using fallback hand model');
    }
    
    createPalm() {
        // Create the mechanical palm body
        const palmGeometry = new THREE.BoxGeometry(2.4, 0.6, 3.0);
        const palmMaterial = new THREE.MeshPhysicalMaterial({ 
            color: 0x4a5568,
            metalness: 0.8,
            roughness: 0.2,
            clearcoat: 0.5,
            clearcoatRoughness: 0.1
        });
        const palm = new THREE.Mesh(palmGeometry, palmMaterial);
        palm.position.set(0, 0, 0);
        palm.castShadow = true;
        palm.receiveShadow = true;
        this.handModel?.add(palm);
        
        // Add mechanical wrist
        this.createRobotWrist();
    }
    
    createRobotWrist() {
        // Mechanical wrist body
        const wristGeometry = new THREE.CylinderGeometry(0.9, 1.0, 1.8, 12);
        const wristMaterial = new THREE.MeshPhysicalMaterial({ 
            color: 0x2d3748,
            metalness: 0.9,
            roughness: 0.3
        });
        const wrist = new THREE.Mesh(wristGeometry, wristMaterial);
        wrist.position.set(0, -0.9, -1.2);
        wrist.castShadow = true;
        wrist.receiveShadow = true;
        this.handModel?.add(wrist);
    }
    
    createFingers() {
        // Left hand finger config (finger1=thumb, finger2=index, finger3=middle, finger4=ring, finger5=pinky)
        const fingerConfigs = [
            { name: 'thumb', position: [1.6, 0, 0.2], rotation: [Math.PI / 2, 0, 0.6], scale: [0.9, 0.9, 0.8] },    // finger1: thumb (spread outward)
            { name: 'index', position: [0.7, 0, 1.5], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 1] },            // finger2: index
            { name: 'middle', position: [0, 0, 1.5], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 1.1] },           // finger3: middle
            { name: 'ring', position: [-0.7, 0, 1.5], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 0.95] },         // finger4: ring
            { name: 'pinky', position: [-1.3, 0, 1.5], rotation: [Math.PI / 2, 0, -0.1], scale: [0.8, 0.8, 0.8] }  // finger5: pinky
        ];
        
        fingerConfigs.forEach((config, index) => {
            const finger = this.createFinger(config.name, index);
            finger.position.set(config.position[0], config.position[1], config.position[2]);
            finger.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
            finger.scale.set(config.scale[0], config.scale[1], config.scale[2]);
            
            if (!this.bones[index]) {
                this.bones[index] = [];
            }
            // @ts-ignore
            this.bones[index] = finger.joints;
            
            this.handModel?.add(finger);
        });
    }
    
    createFinger(name: string, index: number) {
        const fingerGroup = new THREE.Group();
        fingerGroup.name = name;
        
        // Adjust joint config based on finger type
        let joints;
        if (name === 'thumb') {
            joints = [
                { length: 0.9, radius: 0.16, type: 'base' },
                { length: 0.7, radius: 0.13, type: 'middle' },
                { length: 0.5, radius: 0.11, type: 'tip' }
            ];
        } else if (name === 'pinky') {  // no change needed
            joints = [
                { length: 0.6, radius: 0.09, type: 'base' },
                { length: 0.5, radius: 0.08, type: 'middle' },
                { length: 0.3, radius: 0.07, type: 'tip' }
            ];
        } else {
            joints = [
                { length: 0.8, radius: 0.13, type: 'base' },
                { length: 0.7, radius: 0.11, type: 'middle' },
                { length: 0.5, radius: 0.09, type: 'tip' }
            ];
        }
        
        let currentY = 0;
        const jointMeshes: THREE.Group[] = [];
        
        joints.forEach((joint, jointIndex) => {
            // Create mechanical finger joint
            const jointPivot = this.createRobotJoint(joint, jointIndex, joints.length);
            jointPivot.position.y = currentY;
            
            fingerGroup.add(jointPivot);
            jointMeshes.push(jointPivot);
            
            currentY += joint.length;
        });
        
        // Store joint references for animation
        // @ts-ignore
        fingerGroup.joints = jointMeshes;
        
        return fingerGroup;
    }
    
    createRobotJoint(joint: any, jointIndex: number, totalJoints: number) {
        const jointPivot = new THREE.Group();
        
        // Main joint material
        const jointMaterial = new THREE.MeshPhysicalMaterial({ 
            color: jointIndex === 0 ? 0x4a5568 : 0x2d3748,
            metalness: 0.9,
            roughness: 0.2,
            clearcoat: 0.3
        });
        
        // Create mechanical joint body
        const mainGeometry = new THREE.CylinderGeometry(
            joint.radius * 0.9, joint.radius, joint.length * 0.8, 8
        );
        const mainJoint = new THREE.Mesh(mainGeometry, jointMaterial);
        mainJoint.position.y = joint.length * 0.4;
        mainJoint.castShadow = true;
        mainJoint.receiveShadow = true;
        jointPivot.add(mainJoint);
        
        return jointPivot;
    }
    
    updateFingerBending(fingerIndex: number, value: number) {
        if (fingerIndex < 0 || fingerIndex >= 5) return;

        // Now value is the bend amount (0=extended, positive=bent)
        // Map bend value to angle; assume max bend 300 corresponds to 90 degrees
        const maxBendValue = 300;
        const normalizedValue = Math.max(0, Math.min(value / maxBendValue, 1));
        const bendAngle = normalizedValue * Math.PI / 2; // 0-90 degrees converted to radians
        
        // If rigged model bones exist
        if (this.bones[fingerIndex] && Array.isArray(this.bones[fingerIndex])) {
            this.bones[fingerIndex].forEach((bone, jointIndex) => {
                if (bone && bone.rotation) {
                    const jointBend = bendAngle * (jointIndex + 1) / this.bones[fingerIndex].length;
                    bone.rotation.x = -jointBend;
                }
            });
        }
        // If fallback model
        else if (this.handModel && this.handModel.children) {
            const fingerNames = ['thumb', 'index', 'middle', 'ring', 'pinky'];
            const finger = this.handModel.children.find(child => 
                child.name === fingerNames[fingerIndex]
            );
            
            // @ts-ignore
            if (finger && finger.joints) {
                // @ts-ignore
                // Fix: use negative angle so fingers bend inward on the horizontal plane
                finger.joints.forEach((joint, jointIndex) => {
                    const jointBend = bendAngle * (jointIndex + 1) / (finger as any).joints.length;
                    joint.rotation.x = -jointBend; // negative angle, bend inward
                });
            }
        }
        
        this.fingerData[fingerIndex] = value;
    }
    
    updateHandRotation(imuData: any) {
        if (!this.handModel) return;
        
        // Use accelerometer data to calculate hand tilt
        const { x, y, z } = imuData.accelerometer;
        
        // Calculate rotation angles
        const rotationX = Math.atan2(y, Math.sqrt(x * x + z * z));
        const rotationZ = Math.atan2(x, Math.sqrt(y * y + z * z));
        
        // Smooth rotation update
        this.handModel.rotation.x = THREE.MathUtils.lerp(
            this.handModel.rotation.x, rotationX, 0.1
        );
        this.handModel.rotation.z = THREE.MathUtils.lerp(
            this.handModel.rotation.z, rotationZ, 0.1
        );
        
        this.imuData = imuData;
    }
    
    updateFromSensorData(sensorData: any) {
        // Update finger bending
        if (sensorData.fingers) {
            sensorData.fingers.forEach((value: number, index: number) => {
                this.updateFingerBending(index, value);
            });
        }
        
        // Update hand rotation
        if (sensorData.accelerometer) {
            this.updateHandRotation({
                accelerometer: sensorData.accelerometer,
                gyroscope: sensorData.gyroscope || { x: 0, y: 0, z: 0 },
                magnetometer: sensorData.magnetometer || { x: 0, y: 0, z: 0 }
            });
        }
    }
    
    addEventListeners() {
        // Window resize
        window.addEventListener('resize', () => {
            this.onWindowResize();
        });
        
        // Mouse control
        let isMouseDown = false;
        let mouseX = 0;
        let mouseY = 0;
        
        if (this.renderer) {
            this.renderer.domElement.addEventListener('mousedown', (event) => {
                isMouseDown = true;
                mouseX = event.clientX;
                mouseY = event.clientY;
            });
            
            this.renderer.domElement.addEventListener('mousemove', (event) => {
                if (!isMouseDown || !this.handModel) return;
                
                const deltaX = event.clientX - mouseX;
                const deltaY = event.clientY - mouseY;
                
                this.handModel.rotation.y += deltaX * 0.01;
                this.handModel.rotation.x += deltaY * 0.01;
                
                mouseX = event.clientX;
                mouseY = event.clientY;
            });
            
            this.renderer.domElement.addEventListener('mouseup', () => {
                isMouseDown = false;
            });
            
            // Scroll to zoom
            this.renderer.domElement.addEventListener('wheel', (event) => {
                const delta = event.deltaY * 0.001;
                if (this.camera) {
                    this.camera.position.z = Math.max(2, Math.min(10, this.camera.position.z + delta));
                }
            });
        }
    }
    
    onWindowResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(0.016); // assuming 60fps
        }
        
        // Mechanical hand animation effects
        const time = Date.now() * 0.001;
        if (this.handModel) {
            // Mechanical hand subtle floating
            this.handModel.position.y = Math.sin(time * 1.2) * 0.03 - 1;
            
            // Mechanical hand slight rotation
            this.handModel.rotation.y += Math.sin(time * 0.3) * 0.001;
        }
        
        this.renderer?.render(this.scene!, this.camera!);
    }
    
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.renderer && this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
            this.renderer.dispose();
        }
    }
}

export default Hand3D;