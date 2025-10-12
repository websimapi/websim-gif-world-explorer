import gifler from 'gifler';

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
        this.ctx = this.canvas.getContext('2d');
        
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
        this.onWindowResize();
        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));

        await this.preloadGifs();
        this.createPlayer();
        
        this.updateChunks();
        requestAnimationFrame(this.animate.bind(this));
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
        canvas.width = SPRITE_SIZE;
        canvas.height = SPRITE_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Let's get the original GIF dimensions to scale it correctly
        const tempImg = new Image();
        const dimensionPromise = new Promise((resolve) => {
            tempImg.onload = () => resolve({ width: tempImg.naturalWidth, height: tempImg.naturalHeight });
            tempImg.src = src;
        });

        dimensionPromise.then(({ width, height }) => {
            const animator = gifler(src).frames(canvas, (frameCtx, frame) => {
                // Calculate aspect ratio to fit into SPRITE_SIZE square
                const ratio = Math.min(SPRITE_SIZE / width, SPRITE_SIZE / height);
                const drawWidth = width * ratio;
                const drawHeight = height * ratio;
                const offsetX = (SPRITE_SIZE - drawWidth) / 2;
                const offsetY = (SPRITE_SIZE - drawHeight) / 2;

                frameCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
                frameCtx.drawImage(frame.buffer, offsetX, offsetY, drawWidth, drawHeight);
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
        }
        this.chunks.set(`${x},${y}`, {});
    }
    
    unloadChunk(key) {
        // For simplicity, we'll leave collectibles that are out of range.
        // They will be garbage collected if the user never returns.
        this.chunks.delete(key);
    }

    onWindowResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    onPointerDown(event) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        // Convert screen coordinates to world coordinates
        this.targetPosition.x = screenX - this.canvas.width / 2 + this.camera.x;
        this.targetPosition.y = screenY - this.canvas.height / 2 + this.camera.y;
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
        collectedKeys.forEach(key => this.collectibles.delete(key));
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

    animate(timestamp) {
        const deltaTime = (timestamp - this.lastTime) / 1000 || 0;
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.draw();
        
        requestAnimationFrame(this.animate.bind(this));
    }
}

new Game();