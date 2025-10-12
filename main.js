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
        this.canvas2d = document.getElementById('game-canvas-2d');
        this.canvas3d = document.getElementById('game-canvas-3d');
        this.gameContainer = document.getElementById('game-container');
        this.toggleButton = document.getElementById('view-toggle');
        
        this.viewMode = '2d'; // '2d' or '3d'
        
        // 2D Renderer state
        this.ctx = null;
        
        // 3D Renderer state
        this.three = {
            renderer: null,
            scene: null,
            camera: null,
            sprites: new Map(),
            textures: new Map(),
            ground: null,
        };

        this.player = null;
        this.targetPosition = { x: 0, y: 0 };
        this.collectibles = new Map();
        
        this.gifRenderers = new Map();

        this.chunks = new Map();
        this.characterPool = [...GIF_ASSETS];
        
        this.camera = { x: 0, y: 0 };
        this.lastTime = 0;

        this.init();
    }

    async init() {
        this.toggleButton.addEventListener('click', this.toggleView.bind(this));
        
        window.addEventListener('resize', this.onWindowResize.bind(this));
        // Add listeners to both canvases
        this.canvas2d.addEventListener('pointerdown', this.onPointerDown.bind(this));
        this.canvas3d.addEventListener('pointerdown', this.onPointerDown.bind(this));

        await this.preloadGifs();
        this.createPlayer();
        
        this.setup2D();
        this.setup3D(); // Set up both renderers at the start

        this.updateChunks();
        requestAnimationFrame(this.animate.bind(this));
    }

    toggleView() {
        if (this.viewMode === '2d') {
            this.viewMode = '3d';
            this.toggleButton.textContent = 'Switch to 2D View';
            this.canvas2d.classList.add('hidden');
            this.canvas3d.classList.remove('hidden');
        } else {
            this.viewMode = '2d';
            this.toggleButton.textContent = 'Switch to 3D View';
            this.canvas3d.classList.add('hidden');
            this.canvas2d.classList.remove('hidden');
        }
        this.onWindowResize(); // Ensure the visible canvas is sized correctly
    }

    setup2D() {
        this.ctx = this.canvas2d.getContext('2d');
        this.onWindowResize();
    }

    teardown2D() {
        // No longer needed to tear anything down
        this.ctx = null;
    }

    setup3D() {
        // Renderer
        try {
            this.three.renderer = new THREE.WebGLRenderer({ canvas: this.canvas3d, antialias: true, alpha: true });
        } catch (e) {
            console.error("Error creating WebGL context:", e);
            // If 3D fails to initialize, hide the toggle button and stick to 2D
            this.toggleButton.style.display = 'none';
            this.viewMode = '2d'; 
            this.canvas3d.classList.add('hidden');
            this.canvas2d.classList.remove('hidden');
            return;
        }

        this.three.renderer.setPixelRatio(window.devicePixelRatio);
        this.three.renderer.setSize(this.gameContainer.clientWidth, this.gameContainer.clientHeight);

        // Scene
        this.three.scene = new THREE.Scene();
        this.three.scene.background = new THREE.Color(0x87ceeb);
        // Adjust fog to be less dense
        this.three.scene.fog = new THREE.Fog(0x87ceeb, CHUNK_SIZE, CHUNK_SIZE * (RENDER_DISTANCE + 1.5));

        // Camera
        this.three.camera = new THREE.PerspectiveCamera(75, this.gameContainer.clientWidth / this.gameContainer.clientHeight, 0.1, 5000);
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.three.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(-1, 1.75, 1);
        this.three.scene.add(directionalLight);
        
        // Ground
        const groundSize = CHUNK_SIZE * (RENDER_DISTANCE * 2 + 1);
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
        
        // Create a texture with a grid pattern for the ground
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
        
        this.three.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.three.ground.rotation.x = -Math.PI / 2;
        this.three.scene.add(this.three.ground);

        // Create 3D representations for existing objects that might exist before this is called
        if (this.player) this.add3dSprite(this.player);
        this.collectibles.forEach(c => this.add3dSprite(c));
        
        this.onWindowResize();
    }
    
    add3dSprite(obj) {
        if (!this.gifRenderers.has(obj.assetPath) || !this.three.scene) return;

        const canvas = this.gifRenderers.get(obj.assetPath);
        const texture = new THREE.CanvasTexture(canvas);
        this.three.textures.set(obj.assetPath, texture);

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(SPRITE_SIZE, SPRITE_SIZE, 1);
        
        this.three.sprites.set(obj, sprite);
        this.three.scene.add(sprite);
    }
    
    remove3dSprite(obj) {
        if (this.three.sprites.has(obj)) {
            const sprite = this.three.sprites.get(obj);
            this.three.scene.remove(sprite);
            sprite.material.map.dispose();
            sprite.material.dispose();
            this.three.sprites.delete(obj);
            // Do not dispose texture, it might be shared by other sprites of the same type
        }
    }

    teardown3D() {
        // No longer needed as we are not destroying the renderer
        // Kept for historical reference, but should not be called.
        if (this.three.renderer) {
            this.three.renderer.dispose();
            this.three.renderer = null;
        }
        this.three.scene = null;
        this.three.camera = null;
        this.three.ground = null;
        this.three.sprites.clear();
        this.three.textures.forEach(t => t.dispose());
        this.three.textures.clear();
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
        // Setting a higher base resolution for better quality in 3D
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
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
                
                // If in 3D mode, mark texture for update
                if (this.viewMode === '3d' && this.three.textures.has(src)) {
                    this.three.textures.get(src).needsUpdate = true;
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
        // The 3D sprite will be created in setup3D
        this.add3dSprite(this.player);
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
            if (this.viewMode === '3d') {
                this.add3dSprite(collectible);
            }
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
        
        this.canvas2d.width = width;
        this.canvas2d.height = height;
        this.canvas3d.width = width;
        this.canvas3d.height = height;

        if (this.three.renderer) {
            this.three.camera.aspect = width / height;
            this.three.camera.updateProjectionMatrix();
            this.three.renderer.setSize(width, height);
        }
    }

    onPointerDown(event) {
        const rect = event.target.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        if (this.viewMode === '2d') {
            // Convert screen coordinates to world coordinates
            this.targetPosition.x = screenX - this.canvas2d.width / 2 + this.camera.x;
            this.targetPosition.y = screenY - this.canvas2d.height / 2 + this.camera.y;
        } else if (this.viewMode === '3d' && this.three.renderer) {
            // Raycasting to find point on ground plane
            const mouse = new THREE.Vector2(
                (screenX / this.canvas3d.clientWidth) * 2 - 1,
                -(screenY / this.canvas3d.clientHeight) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.three.camera);
            const intersects = raycaster.intersectObject(this.three.ground);
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

        // Camera smoothly follows player
        const cameraSpeed = 5 * deltaTime;
        this.camera.x += (this.player.x - this.camera.x) * cameraSpeed;
        this.camera.y += (this.player.y - this.camera.y) * cameraSpeed;
        
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
        if (this.viewMode === '2d') {
            this.draw2D();
        } else {
            this.draw3D();
        }
    }

    draw2D() {
        if (!this.ctx) return;
        this.ctx.fillStyle = '#4caf50';
        this.ctx.fillRect(0, 0, this.canvas2d.width, this.canvas2d.height);

        this.ctx.save();
        this.ctx.translate(this.canvas2d.width / 2 - this.camera.x, this.canvas2d.height / 2 - this.camera.y);

        const objectsToDraw = [this.player, ...this.collectibles.values()].filter(Boolean);
        objectsToDraw.sort((a, b) => a.y - b.y);

        objectsToDraw.forEach(obj => {
            if (obj.renderer) {
                 this.ctx.drawImage(
                    obj.renderer,
                    obj.x - SPRITE_SIZE / 2,
                    obj.y - SPRITE_SIZE,
                    SPRITE_SIZE,
                    SPRITE_SIZE
                );
            }
        });
        
        this.ctx.restore();
    }

    draw3D() {
        if (!this.three.renderer || !this.player) return;

        // Update sprite positions
        this.three.sprites.forEach((sprite, obj) => {
            sprite.position.set(obj.x, SPRITE_SIZE / 2, obj.y);
        });
        
        // Update ground position to align with world chunks
        const playerChunkCoords = this.getChunkCoords(this.player);
        const groundCenterX = (playerChunkCoords.x + 0.5) * CHUNK_SIZE;
        const groundCenterZ = (playerChunkCoords.y + 0.5) * CHUNK_SIZE;
        this.three.ground.position.set(groundCenterX, 0, groundCenterZ);

        // Update camera
        const camDist = 500;
        this.three.camera.position.x += (this.player.x - this.three.camera.position.x) * 0.1;
        this.three.camera.position.z += (this.player.y + camDist - this.three.camera.position.z) * 0.1;
        this.three.camera.position.y += (camDist - this.three.camera.position.y) * 0.1;
        this.three.camera.lookAt(this.player.x, 0, this.player.y);

        this.three.renderer.render(this.three.scene, this.three.camera);
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