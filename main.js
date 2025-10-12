import * as THREE from 'three';

const GIF_ASSETS = [
    '/asset_33 (2).gif', '/asset_24 (2).gif', '/asset_8.gif', '/asset_31.gif', '/asset_42.gif',
    '/asset_35 (1).gif', '/asset_0.gif', '/asset_22 (2).gif', '/asset_13 (1).gif', '/asset_25 (1).gif',
    '/asset_23 (1).gif', '/asset_39.gif', '/asset_12.gif', '/asset_17.gif', '/asset_37.gif',
    '/asset_2 (1).gif', '/asset_7.gif', '/asset_28.gif', '/asset_26.gif', '/asset_10 (1).gif',
    '/asset_34 (11).gif', '/asset_3.gif', '/asset_27 (1).gif', '/asset_40.gif', '/asset_18 (1).gif',
    '/asset_9.gif', '/asset_38.gif', '/asset_4.gif', '/asset_15.gif', '/asset_43.gif',
    '/asset_20 (1).gif', '/asset_6.gif', '/asset_36.gif', '/asset_41.gif', '/asset_11.gif',
    '/asset_30 (8).gif', '/asset_32 (1).gif', '/asset_29.gif', '/asset_14 (1).gif', '/asset_21.gif',
    '/asset_19.gif', '/asset_16 (1).gif', '/asset_5.gif', '/asset_1.gif'
];

const CHUNK_SIZE = 50;
const RENDER_DISTANCE = 2; // in chunks
const PLAYER_SPEED = 5;
const COLLECT_DISTANCE = 2.5;

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.player = null;
        this.targetPosition = new THREE.Vector3();
        this.collectibles = new Map();
        
        this.animatedTextures = []; // To keep track of textures that need updating for GIF animation
        
        this.textureLoader = new THREE.TextureLoader();
        
        this.chunks = new Map();
        this.characterPool = [...GIF_ASSETS];
        
        this.init();
    }

    init() {
        // Renderer setup
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        // Scene and Camera setup
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, CHUNK_SIZE * 1.5, CHUNK_SIZE * (RENDER_DISTANCE + 0.5));
        this.camera.position.set(10, 15, 10);
        this.camera.lookAt(0, 0, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 5);
        this.scene.add(directionalLight);

        // Player
        this.createPlayer();

        // Controls
        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));

        this.updateChunks();
        this.animate();
    }

    createAnimatedTexture(assetPath) {
        const texture = this.textureLoader.load(assetPath);
        this.animatedTextures.push(texture);
        return texture;
    }

    createPlayer() {
        const randomIndex = Math.floor(Math.random() * this.characterPool.length);
        const playerAsset = this.characterPool.splice(randomIndex, 1)[0];

        const texture = this.createAnimatedTexture(playerAsset);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.player = new THREE.Sprite(material);
        this.player.scale.set(2, 2, 1);
        this.player.position.y = 1;
        this.targetPosition.copy(this.player.position);
        this.scene.add(this.player);
    }
    
    getChunkCoords(position) {
        return {
            x: Math.floor((position.x + CHUNK_SIZE / 2) / CHUNK_SIZE),
            z: Math.floor((position.z + CHUNK_SIZE / 2) / CHUNK_SIZE)
        };
    }

    updateChunks() {
        const currentChunkCoords = this.getChunkCoords(this.player.position);
        const chunksToKeep = new Set();

        for (let x = currentChunkCoords.x - RENDER_DISTANCE; x <= currentChunkCoords.x + RENDER_DISTANCE; x++) {
            for (let z = currentChunkCoords.z - RENDER_DISTANCE; z <= currentChunkCoords.z + RENDER_DISTANCE; z++) {
                const key = `${x},${z}`;
                chunksToKeep.add(key);
                if (!this.chunks.has(key)) {
                    this.loadChunk(x, z);
                }
            }
        }
        
        for (const [key, chunk] of this.chunks.entries()) {
            if (!chunksToKeep.has(key)) {
                this.unloadChunk(key, chunk);
            }
        }
    }
    
    loadChunk(x, z) {
        const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
        const material = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
        const chunk = new THREE.Mesh(geometry, material);
        chunk.rotation.x = -Math.PI / 2;
        chunk.position.set(x * CHUNK_SIZE, 0, z * CHUNK_SIZE);
        this.scene.add(chunk);
        this.chunks.set(`${x},${z}`, chunk);
        
        // Spawn collectibles
        if (this.characterPool.length > 0 && Math.random() > 0.3) {
            const charAsset = this.characterPool.pop();
            const texture = this.createAnimatedTexture(charAsset);
            const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const collectible = new THREE.Sprite(material);
            collectible.scale.set(2, 2, 1);
            
            const pos_x = (x * CHUNK_SIZE) + (Math.random() - 0.5) * CHUNK_SIZE;
            const pos_z = (z * CHUNK_SIZE) + (Math.random() - 0.5) * CHUNK_SIZE;
            collectible.position.set(pos_x, 1, pos_z);
            collectible.userData.assetPath = charAsset;
            
            this.scene.add(collectible);
            this.collectibles.set(charAsset, collectible);
        }
    }
    
    unloadChunk(key, chunk) {
        this.scene.remove(chunk);
        chunk.geometry.dispose();
        chunk.material.dispose();
        this.chunks.delete(key);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onPointerDown(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(groundPlane, intersectPoint);
        
        if (intersectPoint) {
            this.targetPosition.copy(intersectPoint);
            this.targetPosition.y = 1;
        }
    }

    update() {
        const delta = this.clock.getDelta();
        const distance = this.player.position.distanceTo(this.targetPosition);

        if (distance > 0.1) {
            const direction = new THREE.Vector3().subVectors(this.targetPosition, this.player.position).normalize();
            this.player.position.add(direction.multiplyScalar(PLAYER_SPEED * delta));
        }

        // Camera follows player
        this.camera.position.x = this.player.position.x + 10;
        this.camera.position.z = this.player.position.z + 10;
        this.camera.lookAt(this.player.position);
        
        this.updateChunks();
        this.checkCollectibles();
    }
    
    checkCollectibles() {
        const collectedKeys = [];
        for (const [key, collectible] of this.collectibles.entries()) {
            if (this.player.position.distanceTo(collectible.position) < COLLECT_DISTANCE) {
                this.scene.remove(collectible);
                
                // Remove texture from animated textures list and dispose
                const texture = collectible.material.map;
                const textureIndex = this.animatedTextures.indexOf(texture);
                if (textureIndex > -1) {
                    this.animatedTextures.splice(textureIndex, 1);
                }
                texture.dispose();

                collectible.material.dispose();
                collectedKeys.push(key);
                this.showUnlockMessage();
            }
        }
        collectedKeys.forEach(key => this.collectibles.delete(key));
    }

    showUnlockMessage() {
        const msgElement = document.getElementById('unlock-message');
        msgElement.classList.remove('hidden');
        msgElement.classList.add('visible');
        setTimeout(() => {
            msgElement.classList.remove('visible');
            msgElement.classList.add('hidden');
        }, 3000);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        // For animated GIFs to work, we need to tell Three.js to update
        // the texture on each frame. Setting `needsUpdate = true` forces
        // the renderer to re-read the texture from the underlying GIF image source.
        for (const texture of this.animatedTextures) {
            texture.needsUpdate = true;
        }

        this.update();
        this.renderer.render(this.scene, this.camera);
    }
}

new Game();