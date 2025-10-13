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

const CHUNK_SIZE = 1000; // World pixels
const RENDER_DISTANCE = 1; // in chunks
const PLAYER_SPEED = 250; // pixels per second
const COLLECT_DISTANCE = 60; // pixels
const SPRITE_SIZE = 100; // pixels

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.gameContainer = document.getElementById('game-container');
        
        // 3D Renderer state
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.sprites = new Map();
        this.textures = new Map();
        this.ground = null;

        this.player = null;
        this.targetPosition = { x: 0, y: 0 };
        this.collectibles = new Map();
        
        this.gifRenderers = new Map();

        this.chunks = new Map();
        this.characterPool = [...GIF_ASSETS];
        
        this.lastTime = 0;

        this.init();
    }

    async init() {
        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));

        await this.preloadGifs();
        this.createPlayer();
        
        this.setup3D();

        this.updateChunks();
        requestAnimationFrame(this.animate.bind(this));
    }

    setup3D() {
        // Renderer
        try {
            this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        } catch (e) {
            console.error("Error creating WebGL context:", e);
            // If 3D fails, we can't do much in a 3D-only setup
            const errorDiv = document.createElement('div');
            errorDiv.style.color = 'white';
            errorDiv.style.textAlign = 'center';
            errorDiv.style.padding = '20px';
            errorDiv.innerHTML = "<h2>Could not initialize 3D graphics (WebGL).</h2><p>Please try a different browser or check if your graphics drivers are up to date.</p>";
            this.gameContainer.innerHTML = '';
            this.gameContainer.appendChild(errorDiv);
            return;
        }

        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.gameContainer.clientWidth, this.gameContainer.clientHeight);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, CHUNK_SIZE, CHUNK_SIZE * (RENDER_DISTANCE + 1.5));

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, this.gameContainer.clientWidth / this.gameContainer.clientHeight, 0.1, 5000);
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(-1, 1.75, 1);
        this.scene.add(directionalLight);
        
        // Ground
        const groundSize = CHUNK_SIZE * (RENDER_DISTANCE * 2 + 1);
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
        
        const gridCanvas = document.createElement('canvas');
        const gridContext = gridCanvas.getContext('2d');
        const canvasSize = 256;
        gridCanvas.width = gridCanvas.height = canvasSize;
        gridContext.fillStyle = '#4caf50';
        gridContext.fillRect(0, 0, canvasSize, canvasSize);
        gridContext.strokeStyle = 'rgba(0,0,0,0.1)';
        gridContext.lineWidth = 2;
        gridContext.beginPath();
        gridContext.moveTo(0, canvasSize);
        gridContext.lineTo(canvasSize, canvasSize);
        gridContext.lineTo(canvasSize, 0);
        gridContext.stroke();

        const groundTexture = new THREE.CanvasTexture(gridCanvas);
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;
        const textureRepeat = groundSize / CHUNK_SIZE;
        groundTexture.repeat.set(textureRepeat, textureRepeat);

        const groundMaterial = new THREE.MeshLambertMaterial({ map: groundTexture });
        
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.scene.add(this.ground);

        // Create 3D representations for existing objects
        this.add3dSprite(this.player);
        this.collectibles.forEach(c => this.add3dSprite(c));
        
        // Initialize camera position
        this.camera.position.set(this.player.x, 400, this.player.y + 300);
        this.camera.lookAt(this.player.x, 0, this.player.y);
        
        this.onWindowResize();
    }
    
    add3dSprite(obj) {
        if (!this.gifRenderers.has(obj.assetPath) || !this.scene) return;

        const canvas = this.gifRenderers.get(obj.assetPath);
        const texture = new THREE.CanvasTexture(canvas);
        this.textures.set(obj.assetPath, texture);

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(SPRITE_SIZE, SPRITE_SIZE, 1);
        
        this.sprites.set(obj, sprite);
        this.scene.add(sprite);
    }
    
    remove3dSprite(obj) {
        if (this.sprites.has(obj)) {
            const sprite = this.sprites.get(obj);
            this.scene.remove(sprite);
            sprite.material.map.dispose();
            sprite.material.dispose();
            this.sprites.delete(obj);
        }
    }

    preloadGifs() {
        const promises = GIF_ASSETS.map(src => this.createGifRenderer(src));
        return Promise.all(promises);
    }

    createGifRenderer(src) {
        if (this.gifRenderers.has(src)) {
            return Promise.resolve(this.gifRenderers.get(src));
        }

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        
        const tempImg = new Image();
        const dimensionPromise = new Promise((resolve) => {
            tempImg.onload = () => resolve({ width: tempImg.naturalWidth, height: tempImg.naturalHeight });
            tempImg.src = src;
        });

        dimensionPromise.then(({ width, height }) => {
            gifler(src).frames(canvas, (frameCtx, frame) => {
                const ratio = Math.min(canvas.width / width, canvas.height / height);
                const drawWidth = width * ratio;
                const drawHeight = height * ratio;
                const offsetX = (canvas.width - drawWidth) / 2;
                const offsetY = (canvas.height - drawHeight) / 2;

                frameCtx.clearRect(0, 0, canvas.width, canvas.height);
                frameCtx.drawImage(frame.buffer, offsetX, offsetY, drawWidth, drawHeight);
                
                if (this.textures.has(src)) {
                    this.textures.get(src).needsUpdate = true;
                }
            });
        });
        
        this.gifRenderers.set(src, canvas);
        return dimensionPromise;
    }

    createPlayer() {
        const randomIndex = Math.floor(Math.random() * this.characterPool.length);
        const playerAsset = this.characterPool.splice(randomIndex, 1)[0];
        
        this.player = {
            x: 0,
            y: 0,
            assetPath: playerAsset,
            renderer: this.gifRenderers.get(playerAsset)
        };
        this.targetPosition.x = this.player.x;
        this.targetPosition.y = this.player.y;
    }

    getChunkCoords(position) {
        return {
            x: Math.floor(position.x / CHUNK_SIZE),
            y: Math.floor(position.y / CHUNK_SIZE)
        };
    }

    updateChunks() {
        if (!this.player) return;
        const currentChunkCoords = this.getChunkCoords(this.player);
        const chunksToKeep = new Set();

        for (let x = currentChunkCoords.x - RENDER_DISTANCE; x <= currentChunkCoords.x + RENDER_DISTANCE; x++) {
            for (let y = currentChunkCoords.y - RENDER_DISTANCE; y <= currentChunkCoords.y + RENDER_DISTANCE; y++) {
                const key = `${x},${y}`;
                chunksToKeep.add(key);
                if (!this.chunks.has(key)) {
                    this.loadChunk(x, y);
                }
            }
        }
        
        for (const key of this.chunks.keys()) {
            if (!chunksToKeep.has(key)) {
                this.unloadChunk(key);
            }
        }
    }

    loadChunk(x, y) {
        if (this.characterPool.length > 0 && Math.random() > 0.3) {
            const charAsset = this.characterPool.pop();
            const collectible = {
                x: (x + Math.random()) * CHUNK_SIZE,
                y: (y + Math.random()) * CHUNK_SIZE,
                assetPath: charAsset,
                renderer: this.gifRenderers.get(charAsset)
            };
            this.collectibles.set(charAsset, collectible);
            this.add3dSprite(collectible);
        }
        this.chunks.set(`${x},${y}`, {});
    }
    
    unloadChunk(key) {
        // For simplicity, we'll leave collectibles that are out of range.
        // They will be garbage collected if the user never returns.
        this.chunks.delete(key);
    }

    onWindowResize() {
        const width = this.gameContainer.clientWidth;
        const height = this.gameContainer.clientHeight;
        
        this.canvas.width = width;
        this.canvas.height = height;

        if (this.renderer) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        }
    }

    onPointerDown(event) {
        const rect = event.target.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        if (this.renderer) {
            // Raycasting to find point on ground plane
            const mouse = new THREE.Vector2(
                (screenX / this.canvas.clientWidth) * 2 - 1,
                -(screenY / this.canvas.clientHeight) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);
            const intersects = raycaster.intersectObject(this.ground);
            if (intersects.length > 0) {
                this.targetPosition.x = intersects[0].point.x;
                this.targetPosition.y = intersects[0].point.z;
            }
        }
    }

    update(deltaTime) {
        if (!this.player) return;
        
        // Move player
        const dx = this.targetPosition.x - this.player.x;
        const dy = this.targetPosition.y - this.player.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 1) {
            const moveSpeed = PLAYER_SPEED * deltaTime;
            this.player.x += (dx / distance) * Math.min(moveSpeed, distance);
            this.player.y += (dy / distance) * Math.min(moveSpeed, distance);
        }
        
        this.updateChunks();
        this.checkCollectibles();
    }
    
    checkCollectibles() {
        const collectedKeys = [];
        for (const [key, collectible] of this.collectibles.entries()) {
            const distance = Math.hypot(this.player.x - collectible.x, this.player.y - collectible.y);

            if (distance < COLLECT_DISTANCE) {
                collectedKeys.push(key);
                this.showUnlockMessage();
            }
        }
        collectedKeys.forEach(key => {
            const collectible = this.collectibles.get(key);
            if (collectible) {
                this.remove3dSprite(collectible);
            }
            this.collectibles.delete(key)
        });
    }

    showUnlockMessage() {
        const msgElement = document.getElementById('unlock-message');
        if (msgElement.classList.contains('visible')) return;

        msgElement.classList.remove('hidden');
        msgElement.classList.add('visible');
        setTimeout(() => {
            msgElement.classList.remove('visible');
            msgElement.classList.add('hidden');
        }, 3000);
    }
    
    draw() {
        if (!this.renderer || !this.player) return;

        // Update sprite positions
        this.sprites.forEach((sprite, obj) => {
            sprite.position.set(obj.x, SPRITE_SIZE / 2, obj.y);
        });
        
        // Update ground position to align with world chunks
        const playerChunkCoords = this.getChunkCoords(this.player);
        const groundCenterX = (playerChunkCoords.x) * CHUNK_SIZE;
        const groundCenterZ = (playerChunkCoords.y) * CHUNK_SIZE;
        this.ground.position.set(groundCenterX, 0, groundCenterZ);

        // Update camera to follow player
        const camDistY = 400;
        const camDistZ = 300;
        const cameraLerpFactor = 0.05;

        const targetCamPos = new THREE.Vector3(this.player.x, camDistY, this.player.y + camDistZ);
        this.camera.position.lerp(targetCamPos, cameraLerpFactor);
        
        const targetLookAt = new THREE.Vector3(this.player.x, 0, this.player.y);
        // We can't just lerp the lookAt. We create a temporary lookAt target and lerp towards it.
        const currentLookAt = new THREE.Vector3();
        this.camera.getWorldDirection(currentLookAt);
        currentLookAt.multiplyScalar(100).add(this.camera.position); // Get current focal point
        currentLookAt.lerp(targetLookAt, cameraLerpFactor);
        this.camera.lookAt(currentLookAt);

        this.renderer.render(this.scene, this.camera);
    }

    animate(timestamp) {
        const deltaTime = (timestamp - this.lastTime) / 1000 || 0;
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.draw();
        
        requestAnimationFrame(this.animate.bind(this));
    }
}

new Game();