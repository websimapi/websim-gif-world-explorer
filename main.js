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
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));

        await this.preloadGifs();
        this.createPlayer();
        
        this.setup2D(); // Initial setup

        this.updateChunks();
        requestAnimationFrame(this.animate.bind(this));
    }

    toggleView() {
        if (this.viewMode === '2d') {
            this.viewMode = '3d';
            this.toggleButton.textContent = 'Switch to 2D View';
            this.teardown2D();
            this.setup3D();
        } else {
            this.viewMode = '2d';
            this.toggleButton.textContent = 'Switch to 3D View';
            this.teardown3D();
            this.setup2D();
        }
    }

    setup2D() {
        this.ctx = this.canvas.getContext('2d');
        this.onWindowResize();
    }

    teardown2D() {
        this.ctx = null;
    }

    setup3D() {
        // Renderer
        this.three.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.three.renderer.setPixelRatio(window.devicePixelRatio);
        this.three.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);

        // Scene
        this.three.scene = new THREE.Scene();
        this.three.scene.background = new THREE.Color(0x87ceeb);
        this.three.scene.fog = new THREE.Fog(0x87ceeb, 0, CHUNK_SIZE * RENDER_DISTANCE * 0.8);

        // Camera
        this.three.camera = new THREE.PerspectiveCamera(75, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 5000);
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.three.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(-1, 1.75, 1);
        this.three.scene.add(directionalLight);
        
        // Ground
        const groundGeometry = new THREE.PlaneGeometry(1, 1);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
        this.three.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.three.ground.rotation.x = -Math.PI / 2;
        this.three.scene.add(this.three.ground);

        // Create 3D representations for existing objects
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
            this.three.textures.delete(obj.assetPath);
        }
    }

    teardown3D() {
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

        // Workaround to release WebGL context. Create a new canvas.
        const newCanvas = this.canvas.cloneNode(true);
        this.gameContainer.replaceChild(newCanvas, this.canvas);
        this.canvas = newCanvas;
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
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
        if (this.viewMode === '3d') {
            this.add3dSprite(this.player);
        }
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
        
        if (this.viewMode === '2d' && this.ctx) {
            this.canvas.width = width;
            this.canvas.height = height;
        } else if (this.viewMode === '3d' && this.three.renderer) {
            this.three.camera.aspect = width / height;
            this.three.camera.updateProjectionMatrix();
            this.three.renderer.setSize(width, height);
        }
    }

    onPointerDown(event) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        if (this.viewMode === '2d') {
            // Convert screen coordinates to world coordinates
            this.targetPosition.x = screenX - this.canvas.width / 2 + this.camera.x;
            this.targetPosition.y = screenY - this.canvas.height / 2 + this.camera.y;
        } else if (this.viewMode === '3d') {
            // Raycasting to find point on ground plane
            const mouse = new THREE.Vector2(
                (screenX / this.canvas.clientWidth) * 2 - 1,
                -(screenY / this.canvas.clientHeight) * 2 + 1
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
            if (this.viewMode === '3d') {
                this.remove3dSprite(this.collectibles.get(key));
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
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2 - this.camera.x, this.canvas.height / 2 - this.camera.y);

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
        
        // Update ground
        const worldSize = CHUNK_SIZE * (RENDER_DISTANCE * 2 + 1);
        this.three.ground.scale.set(worldSize, worldSize, 1);
        this.three.ground.position.set(this.player.x, 0, this.player.y);

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