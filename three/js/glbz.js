// WebXR增强的3D模型查看器 - 重构版
// 支持DRACOLoader、模型交互、漫游模式、顶牌显示等功能

class GLBViewer {
    constructor(options = {}) {
        // 初始化核心变量
        // 支持通过options指定选择器，或默认查找带有特定class和data-label的元素
        const containerSelector = options.containerSelector || '[data-label="acp-gltf"].ax_default.image.transition';
        this.container = document.querySelector(containerSelector);
        
        // 存储选项，便于后续使用
        this.options = options;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.composer = null;
        this.outlinePass = null;
        this.modelUrl = '';
        this.currentModel = null;
        this.modelCardsData = {};
        this.modelGroundY = 0;
        this.modelSprites = new Map();
        this.cardScaleFactor = 0.002;
        this.selectedObject = null;
        this.isDraggingMouse = false;
        this.mouseDownPosition = new THREE.Vector2();
        this.prevTime = performance.now();
        this.pointerLockControls = null;
        this.isWalkthroughMode = false;
        this.moveSpeed = 0.05;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.placementCube = null;
        this.isPlacementMode = false;
        this.placementRaycaster = new THREE.Raycaster();
        this.placementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.placementIntersection = new THREE.Vector3();
        this.mixer = null;
        this.animations = [];
        this.isTopView = false;
        this.lastCameraPos = null;
        this.lastCameraTarget = null;
        this.animationId = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isLoaded = false;

        // 初始化DRACOLoader支持
        this.setupDracoSupport();

        // 初始化卡片缩放因子
        this.initCardScaleFactor();
    }

    // 设置DRACOLoader支持
    setupDracoSupport() {
        return new Promise((resolve) => {
            // 检查是否已加载DRACOLoader
            if (typeof DRACOLoader !== 'undefined' || (typeof THREE !== 'undefined' && typeof THREE.DRACOLoader !== 'undefined')) {
                resolve();
                return;
            }

            // 动态加载DRACOLoader所需脚本
            const scripts = [
                'https://ssm-smart.github.io/axure/three/DRACOLoader.js',
                'https://ssm-smart.github.io/axure/three/draco_decoder.js'
            ];
            let loadedCount = 0;

            scripts.forEach(src => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    loadedCount++;
                    if (loadedCount === scripts.length) {
                        resolve();
                    }
                };
                document.head.appendChild(script);
            });
        });
    }

    // 初始化卡片缩放因子
    initCardScaleFactor() {
        const params = new URLSearchParams(window.location.search);
        const scale = parseFloat(params.get('cardScale'));
        if (!isNaN(scale) && scale > 0) {
            this.cardScaleFactor = scale;
        }
    }

    // 初始化Three.js场景
    async init() {
        if (!this.container) {
            console.error('容器元素不存在，请确保页面中存在带有data-label="acp-gltf"的元素。');
            return;
        }

        // 创建场景
        this.scene = new THREE.Scene();
        // 设置场景背景为透明
        this.scene.background = null;

        // 创建相机
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 10, 20);

        // 创建渲染器 - 启用alpha通道实现透明背景
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true 
        });
        this.renderer.setSize(width, height);
        this.renderer.shadowMap.enabled = true;
        // 设置clearAlpha为0确保完全透明
        this.renderer.setClearColor(0x000000, 0);
        this.container.appendChild(this.renderer.domElement);

        // 创建控制器
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, 0);
        
        // 确保控制器完全启用所有交互功能
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
        this.controls.autoRotate = false;
        console.log('OrbitControls已初始化并启用所有交互功能');

        // 添加光源
        this.setupLights();

        // 不再添加地面网格，满足用户要求移除地面网格

        // 设置事件监听
        this.setupEventListeners();

        // 启动渲染循环
        this.startRenderLoop();

        // 发送就绪信号
        this.notifyAxureReady();
        
        // 尝试加载初始配置
        this.tryLoadInitialConfiguration();

        this.isLoaded = true;
        
        // 添加测试按钮直接显示编辑面板
        this.createTestButton();
    }

    // 设置光源
    setupLights() {
        // 环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // 方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // 点光源
        const pointLight = new THREE.PointLight(0xffffff, 0.4);
        pointLight.position.set(-10, 10, -10);
        this.scene.add(pointLight);
    }

    // 添加地面网格
    addGroundGrid() {
        const gridHelper = new THREE.GridHelper(50, 50, 0x888888, 0xcccccc);
        gridHelper.position.y = -0.01;
        this.scene.add(gridHelper);
    }

    // 设置事件监听
    setupEventListeners() {
        // 窗口大小变化
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // 确保renderer和容器都能接收事件
        this.renderer.domElement.style.pointerEvents = 'auto';
        this.container.style.pointerEvents = 'auto';
        
        // 绑定原始的click事件处理，确保所有点击功能都能正常工作
        this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this), { passive: false });
        
        // 为容器也绑定click事件，确保在Axure环境中也能触发点击功能
        this.container.addEventListener('click', this.onMouseClick.bind(this), { passive: false });
        
        // 为其他鼠标事件绑定，确保OrbitControls能正常工作
        this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this), { passive: false });
        this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this), { passive: false });
        this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this), { passive: false });
        this.renderer.domElement.addEventListener('dblclick', this.onMouseDoubleClick.bind(this), { passive: false });
        
        // 确保OrbitControls能正确处理滚轮事件
        this.renderer.domElement.addEventListener('wheel', (event) => {
            // 不做任何处理，让OrbitControls默认处理滚轮缩放
        }, { passive: true });

        // 键盘事件
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));

        // 消息通信
        window.addEventListener('message', this.onMessageReceived.bind(this));
        
        console.log('事件监听器已重新配置，同时支持Alt+点击和OrbitControls');
    }

    // 窗口大小变化处理
    onWindowResize() {
        if (!this.camera || !this.renderer || !this.composer || !this.outlinePass) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        // 更新相机
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // 更新渲染器
        this.renderer.setSize(width, height);

        // 更新后处理
        if (this.composer) {
            this.composer.setSize(width, height);
        }

        // 更新描边通道
        if (this.outlinePass) {
            this.outlinePass.setSize(width, height);
        }
    }

    // 鼠标按下事件 - 仅记录位置，不阻止默认行为
    onMouseDown(event) {
        this.isDraggingMouse = false;
        this.mouseDownPosition.set(event.clientX, event.clientY);
        // 不阻止默认行为，让OrbitControls能正常工作
    }

    // 鼠标移动事件 - 仅更新位置，不阻止默认行为
    onMouseMove(event) {
        this.updateMousePosition(event);

        // 放置模式下的处理
        if (this.isPlacementMode && this.placementCube) {
            this.updatePlacementPosition(event);
        }
        // 不阻止默认行为，让OrbitControls能正常工作
    }

    // 鼠标释放事件 - 仅判断拖动状态，不阻止默认行为
    onMouseUp(event) {
        const deltaX = Math.abs(event.clientX - this.mouseDownPosition.x);
        const deltaY = Math.abs(event.clientY - this.mouseDownPosition.y);
        const dragThreshold = 5;

        if (deltaX > dragThreshold || deltaY > dragThreshold) {
            this.isDraggingMouse = true;
        }
        // 不阻止默认行为，让OrbitControls能正常工作
    }

    // 鼠标点击事件
    onMouseClick(event) {
        console.log('鼠标点击事件，Alt键状态:', event.altKey);
        
        // 优先检测Alt+左键单击，确保无论是否拖动都能响应
        if (event.altKey) {
            console.log('Alt+点击检测到，强制显示编辑面板');
            this.toggleEditPanel(true); // 传递true参数强制显示面板
            this.isDraggingMouse = false; // 重置拖动状态
            return;
        }
        
        // 非Alt键点击时，才检查拖动状态
        if (this.isDraggingMouse) {
            this.isDraggingMouse = false;
            return;
        }

        this.updateMousePosition(event);

        // 检测顶牌点击
        const spriteIntersects = this.raycaster.intersectObjects(Array.from(this.modelSprites.values()));
        if (spriteIntersects.length > 0) {
            this.handleSpriteClick(spriteIntersects[0].object);
            return;
        }

        // 检测模型点击
        this.handleModelClick();
    }

    // 鼠标双击事件
    onMouseDoubleClick(event) {
        this.updateMousePosition(event);
        this.handleModelDoubleClick();
    }

    // 键盘按下事件
    onKeyDown(event) {
        // 跟踪Alt键状态
        if (event.key === 'Alt') {
            console.log('Alt键按下');
        }
        
        if (!this.isWalkthroughMode) return;

        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.moveForward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.moveBackward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.moveLeft = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.moveRight = true;
                break;
        }
    }

    // 键盘释放事件
    onKeyUp(event) {
        if (!this.isWalkthroughMode) return;

        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.moveForward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.moveBackward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.moveLeft = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.moveRight = false;
                break;
        }
    }

    // 消息接收处理
    onMessageReceived(event) {
        if (!event.data || !event.data.command) return;

        const command = event.data.command;
        switch (command) {
            case 'showLoading':
                this.showLoadingProgress(0);
                break;
            case 'hideLoading':
                this.hideLoadingProgress();
                break;
            case 'playAnimation':
                this.playAnimation(event.data.animationName);
                break;
            case 'stopAnimation':
                this.stopAnimation();
                break;
            case 'loadModel':
                this.loadModel(event.data.modelUrl);
                break;
            case 'toggleWalkthrough':
                this.toggleWalkthroughMode();
                break;
            case 'toggleTopView':
                this.toggleTopView();
                break;
            case 'setModelCards':
                this.setModelCardsData(event.data.cardsData);
                break;
        }
    }

    // 更新鼠标位置
    updateMousePosition(event) {
        this.mouse.x = (event.clientX / this.container.clientWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / this.container.clientHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
    }

    // 处理顶牌点击
    handleSpriteClick(sprite) {
        const modelName = sprite.userData.modelName || sprite.userData.objectName || '';
        const cardText = sprite.userData.cardConfig?.content || sprite.userData.cardText || '';
        
        console.log('顶牌被点击:', { modelName, cardText });
        
        // 发送消息给Axure，包含对象名称
        if (typeof window.parent !== 'undefined' && window.parent.postMessage) {
            window.parent.postMessage({
                command: 'cardClicked',
                objectName: modelName,  // 主要字段，确保Axure能识别
                modelName: modelName,   // 保留兼容字段
                cardText: cardText
            }, '*');
        }
    }

    // 处理模型点击
    handleModelClick() {
        if (!this.currentModel) return;

        const intersects = this.raycaster.intersectObject(this.currentModel, true);
        
        if (intersects.length > 0) {
            this.selectedObject = intersects[0].object;
            this.updateOutlineSelection([this.selectedObject]);
        } else {
            this.selectedObject = null;
            this.updateOutlineSelection([]);
        }
    }

    // 处理模型双击（聚焦）
    handleModelDoubleClick() {
        if (!this.currentModel) return;

        const intersects = this.raycaster.intersectObject(this.currentModel, true);
        
        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;
            
            // 发送选中消息
            window.parent.postMessage({
                command: 'modelSelected',
                modelName: clickedObject.name
            }, '*');

            // 聚焦到选中的模型
            this.focusOnObject(clickedObject);
        }
    }

    // 聚焦到对象
    focusOnObject(object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        const cameraDistance = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.3;

        const targetCameraPosition = new THREE.Vector3(
            center.x,
            center.y + cameraDistance * 0.7,
            center.z + cameraDistance * 1.2
        );

        // 使用TWEEN进行平滑过渡
        new TWEEN.Tween(this.camera.position)
            .to(targetCameraPosition, 800)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onUpdate(() => {
                if (this.controls) {
                    this.controls.target.copy(center);
                    this.controls.update();
                }
            })
            .start();
    }

    // 更新描边选择
    updateOutlineSelection(objects) {
        if (!this.outlinePass) return;
        this.outlinePass.selectedObjects = objects;
    }

    // 加载模型
    async loadModel(url) {
        if (!url) {
            console.error('模型URL为空');
            return;
        }

        this.showLoadingProgress(0);
        this.modelUrl = url;

        // 移除旧模型
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
            this.currentModel = null;
        }

        // 清除动画
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }
        this.animations = [];

        try {
            // 创建带DRACOLoader支持的GLTFLoader
            const loader = await this.createEnhancedGLTFLoader();
            
            loader.load(
                url,
                (gltf) => this.onModelLoaded(gltf),
                (xhr) => this.onModelLoadingProgress(xhr),
                (error) => this.onModelLoadError(error)
            );
        } catch (error) {
            this.onModelLoadError(error);
        }
    }

    // 创建增强的GLTFLoader（带DRACOLoader支持）
    async createEnhancedGLTFLoader() {
        await this.setupDracoSupport();
        
        const loader = new THREE.GLTFLoader();
        
        // 尝试添加DRACOLoader支持
        try {
            const DRACOCtor = typeof THREE !== 'undefined' && typeof THREE.DRACOLoader !== 'undefined' 
                ? THREE.DRACOLoader 
                : (typeof window !== 'undefined' ? window.DRACOLoader : null);
            
            if (DRACOCtor) {
                const dracoLoader = new DRACOCtor();
                dracoLoader.setDecoderPath('https://ssm-smart.github.io/axure/three/');
                loader.setDRACOLoader(dracoLoader);
            }
        } catch (error) {
            console.warn('添加DRACOLoader支持失败:', error);
        }
        
        return loader;
    }

    // 模型加载完成处理
    onModelLoaded(gltf) {
        this.currentModel = gltf.scene;
        this.scene.add(this.currentModel);

        // 保存动画
        this.animations = gltf.animations || [];
        if (this.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.currentModel);
        }

        this.hideLoadingProgress();
        
        // 隐藏容器封面
        this.hideContainerCover();

        // 自动定位相机
        this.autoPositionCameraAndControls(this.currentModel);

        // 异步初始化后处理和顶牌
        setTimeout(() => {
            this.setupPostProcessing();
            this.updateModelSprites();
        }, 0);

        // 通知模型加载完成
        window.parent.postMessage({ command: 'modelLoaded' }, '*');
    }

    // 模型加载进度处理
    onModelLoadingProgress(xhr) {
        if (xhr.lengthComputable) {
            const percentComplete = xhr.loaded / xhr.total * 100;
            this.showLoadingProgress(percentComplete);
        }
    }

    // 模型加载错误处理
    onModelLoadError(error) {
        console.error('模型加载错误:', error);
        this.showError('模型加载失败: ' + (error.message || '未知错误'));
        this.hideLoadingProgress();
    }

    // 自动定位相机和控制器
    autoPositionCameraAndControls(model) {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // 计算模型尺寸和合适的相机距离
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        const cameraDistance = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.5;

        // 设置相机位置
        this.camera.position.set(
            center.x,
            center.y + cameraDistance * 0.5,
            center.z + cameraDistance
        );

        // 设置控制器目标
        if (this.controls) {
            this.controls.target.copy(center);
            this.controls.update();
        }

        // 保存地面Y坐标
        this.modelGroundY = center.y - size.y / 2;
    }

    // 设置后处理效果
    setupPostProcessing() {
        if (this.composer) return;

        try {
            // 检查必要的依赖是否已加载
            if (!THREE.EffectComposer || !THREE.RenderPass || !THREE.ShaderPass) {
                console.warn('必要的后处理依赖未加载，跳过后处理设置');
                return;
            }

            const width = this.container.clientWidth;
            const height = this.container.clientHeight;

            // 创建合成器
            this.composer = new THREE.EffectComposer(this.renderer);

            // 添加渲染通道
            const renderPass = new THREE.RenderPass(this.scene, this.camera);
            this.composer.addPass(renderPass);

            // 尝试添加描边通道
            if (THREE.OutlinePass) {
                try {
                    this.outlinePass = new THREE.OutlinePass(new THREE.Vector2(width, height), this.scene, this.camera);
                    this.outlinePass.edgeStrength = 3;
                    this.outlinePass.edgeGlow = 1;
                    this.outlinePass.edgeThickness = 1;
                    this.outlinePass.pulsePeriod = 0;
                    this.outlinePass.visibleEdgeColor.set(0x00ff00);
                    this.composer.addPass(this.outlinePass);
                } catch (error) {
                    console.warn('添加描边通道失败:', error);
                }
            }

            // 尝试添加FXAA通道
            if (THREE.FXAAShader) {
                try {
                    const effectFXAA = new THREE.ShaderPass(THREE.FXAAShader);
                    if (effectFXAA.uniforms && effectFXAA.uniforms['resolution']) {
                        effectFXAA.uniforms['resolution'].value.set(1 / width, 1 / height);
                        this.composer.addPass(effectFXAA);
                    }
                } catch (error) {
                    console.warn('添加抗锯齿通道失败:', error);
                }
            }
        } catch (error) {
            console.error('设置后处理效果时出错:', error);
        }
    }

    // 更新模型顶牌
    updateModelSprites() {
        console.log('更新模型顶牌，配置数量:', Object.keys(this.modelCardsData || {}).length);
        
        // 清除旧的顶牌
        this.modelSprites.forEach(sprite => {
            this.scene.remove(sprite);
        });
        this.modelSprites.clear();

        if (!this.currentModel || !this.modelCardsData || Object.keys(this.modelCardsData).length === 0) {
            console.log('没有模型或顶牌配置可更新');
            return;
        }

        // 遍历模型中的所有对象
        let createdCount = 0;
        this.currentModel.traverse((object) => {
            if (object.isMesh && this.modelCardsData[object.name]) {
                this.createModelSprite(object, this.modelCardsData[object.name]);
                createdCount++;
            }
        });
        
        console.log(`共创建 ${createdCount} 个顶牌`);
    }
    
    // 更新顶牌位置，确保它们始终跟随对象并面向摄像机
    updateSprites() {
        this.modelSprites.forEach((sprite, objectName) => {
            const object = sprite.userData.targetObject;
            if (object) {
                // 更新位置
                const box = new THREE.Box3().setFromObject(object);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const offsetY = size.y * 0.2; // 调整为只在物体上方高一点
                sprite.position.set(center.x, center.y + offsetY, center.z);
            }
        });
    }

    // 创建模型顶牌
    createModelSprite(object, cardConfig) {
        // 支持旧版直接传入文本的方式
        const text = cardConfig.content || cardConfig.text || cardConfig;
        const color = cardConfig.color || '#ffffff';
        const bgcolor = cardConfig.bgcolor || '#000000';
        const opacity = cardConfig.opacity !== undefined ? cardConfig.opacity : 0.8;
        
        // 创建画布
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // 设置画布样式
        const padding = 10;
        const fontSize = 14;
        context.font = `${fontSize}px Arial`;
        
        // 计算多行文本宽度
        const lines = text.split('\n');
        let maxWidth = 0;
        lines.forEach(line => {
            const lineWidth = context.measureText(line).width;
            maxWidth = Math.max(maxWidth, lineWidth);
        });
        
        canvas.width = maxWidth + padding * 2;
        canvas.height = fontSize * lines.length + padding * 2;
        
        // 解析背景色并添加透明度
        let bgR = parseInt(bgcolor.substring(1, 3), 16);
        let bgG = parseInt(bgcolor.substring(3, 5), 16);
        let bgB = parseInt(bgcolor.substring(5, 7), 16);
        
        // 绘制背景（带透明度）
        context.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${opacity})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // 解析文字颜色
        let textR = parseInt(color.substring(1, 3), 16);
        let textG = parseInt(color.substring(3, 5), 16);
        let textB = parseInt(color.substring(5, 7), 16);
        
        // 绘制多行文字
        context.fillStyle = `rgb(${textR}, ${textG}, ${textB})`;
        context.textAlign = 'center';
        context.textBaseline = 'top';
        lines.forEach((line, index) => {
            context.fillText(line, canvas.width / 2, padding + index * fontSize);
        });
        
        // 创建纹理
        const texture = new THREE.CanvasTexture(canvas);
        
        // 创建精灵材质（启用透明度）
        const material = new THREE.SpriteMaterial({ 
            map: texture, 
            transparent: true,
            opacity: opacity
        });
        
        // 创建精灵
        const sprite = new THREE.Sprite(material);
        sprite.userData.modelName = object.name;
        sprite.userData.cardText = text;
        
        // 设置精灵位置（在物体上方）
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        sprite.position.set(center.x, center.y + size.y / 2 + 0.1, center.z);
        
        // 设置精灵大小
        const scale = Math.max(size.x, size.z) * this.cardScaleFactor;
        sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
        
        // 添加到场景
        this.scene.add(sprite);
        this.modelSprites.set(object.name, sprite);
    }

    // 设置模型顶牌数据
    setModelCardsData(cardsData) {
        this.modelCardsData = cardsData || {};
        this.updateModelSprites();
    }
    
    // 更新模型对象列表
    updateObjectList() {
        const objectSelect = this.editPanel.querySelector('#model-objects');
        if (!objectSelect || !this.currentModel) return;
        
        // 清空现有选项
        objectSelect.innerHTML = '';
        
        // 收集并添加所有网格对象
        const objects = [];
        this.currentModel.traverse((object) => {
            if (object.isMesh && object.name) {
                objects.push(object.name);
            }
        });
        
        // 排序并添加到选择列表
        objects.sort().forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            objectSelect.appendChild(option);
        });
        
        console.log(`已加载 ${objects.length} 个模型对象`);
    }
    
    // 添加顶牌配置
    addCardConfiguration() {
        const objectSelect = this.editPanel.querySelector('#model-objects');
        const configList = this.editPanel.querySelector('#card-config-list');
        if (!objectSelect || !configList) return;
        
        // 获取选中的对象
        const selectedObjects = Array.from(objectSelect.selectedOptions).map(option => option.value);
        if (selectedObjects.length === 0) {
            this.showNotification('请先选择一个或多个模型对象');
            return;
        }
        
        selectedObjects.forEach(objectName => {
            // 检查是否已存在该对象的配置
            if (document.querySelector(`#card-config-${objectName}`)) {
                return; // 已存在则跳过
            }
            
            // 创建配置容器
            const configContainer = document.createElement('div');
            configContainer.id = `card-config-${objectName}`;
            configContainer.className = 'card-config-item';
            configContainer.style.padding = '8px';
            configContainer.style.background = '#333';
            configContainer.style.borderRadius = '4px';
            configContainer.style.display = 'flex';
            configContainer.style.flexDirection = 'column';
            configContainer.style.gap = '5px';
            
            // 创建配置HTML
            configContainer.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <label style="font-weight: bold; color: #ddd;">${objectName}</label>
                    <button type="button" class="remove-config-btn" style="background: #f44336; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px;">
                        移除
                    </button>
                </div>
                <label style="font-size: 12px; color: #aaa;">启用顶牌：<input type="checkbox" class="enable-card" checked></label>
                <label style="font-size: 12px; color: #aaa;">标题：<input type="text" class="card-title" placeholder="对象标题" style="width: 100%; background: #444; color: white; border: 1px solid #555; border-radius: 3px; padding: 3px;"></label>
                <label style="font-size: 12px; color: #aaa;">数据：<input type="text" class="card-value" placeholder="数值" style="width: 100%; background: #444; color: white; border: 1px solid #555; border-radius: 3px; padding: 3px;"></label>
                <label style="font-size: 12px; color: #aaa;">单位：<input type="text" class="card-unit" placeholder="单位" style="width: 100%; background: #444; color: white; border: 1px solid #555; border-radius: 3px; padding: 3px;"></label>
                <div style="font-size: 12px; color: #aaa;">
                    <label style="display: block; margin-bottom: 5px;">图标上传 (PNG, SVG)：</label>
                    <input type="file" class="card-icon-upload" accept=".png,.svg" style="width: 100%; background: #444; color: white; border: 1px solid #555; border-radius: 3px; padding: 3px;">
                    <input type="hidden" class="card-icon" value="">
                    <div class="icon-preview" style="margin-top: 5px; display: none; text-align: center;">
                        <img src="" alt="图标预览" style="max-width: 50px; max-height: 50px;">
                    </div>
                </div>
                <div style="font-size: 12px; color: #aaa;">
                    <label style="display: block; margin-bottom: 5px;">文字颜色：<input type="color" class="card-color" value="#000000" style="width: 100%; background: #444; border: 1px solid #555; border-radius: 3px;"></label>
                    <label style="display: block; margin-bottom: 5px;">文字透明度 (0-100)：<input type="number" class="card-color-opacity" min="0" max="100" value="100" style="width: 100%; background: #444; color: white; border: 1px solid #555; border-radius: 3px; padding: 3px;"></label>
                </div>
                <div style="font-size: 12px; color: #aaa;">
                    <label style="display: block; margin-bottom: 5px;">背景颜色：<input type="color" class="card-bgcolor" value="#ffffff" style="width: 100%; background: #444; border: 1px solid #555; border-radius: 3px;"></label>
                    <label style="display: block; margin-bottom: 5px;">背景透明度 (0-100)：<input type="number" class="card-bgcolor-opacity" min="0" max="100" value="100" style="width: 100%; background: #444; color: white; border: 1px solid #555; border-radius: 3px; padding: 3px;"></label>
                </div>
            `;
            // 添加移除按钮事件
            configContainer.querySelector('.remove-config-btn').addEventListener('click', () => {
                configList.removeChild(configContainer);
            });
            
            // 添加图标上传事件处理
            const iconUpload = configContainer.querySelector('.card-icon-upload');
            const iconInput = configContainer.querySelector('.card-icon');
            const iconPreview = configContainer.querySelector('.icon-preview');
            const previewImg = iconPreview.querySelector('img');
            
            iconUpload.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    // 检查文件类型
                    if (file.type === 'image/png' || file.type === 'image/svg+xml' || file.name.endsWith('.png') || file.name.endsWith('.svg')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const dataUrl = e.target.result;
                            iconInput.value = dataUrl;
                            previewImg.src = dataUrl;
                            iconPreview.style.display = 'block';
                        };
                        reader.readAsDataURL(file);
                    } else {
                        this.showNotification('请上传PNG或SVG格式的图片');
                        iconUpload.value = '';
                    }
                }
            });
            
            configList.appendChild(configContainer);
        });
        
        this.showNotification(`已添加 ${selectedObjects.length} 个对象配置`);
    }
    
    // 应用顶牌配置
    applyCardConfigurations() {
        const configItems = this.editPanel.querySelectorAll('.card-config-item');
        if (configItems.length === 0) {
            this.showNotification('没有顶牌配置可应用');
            return;
        }
        
        const newCardsData = {};
        
        configItems.forEach(item => {
            const objectName = item.id.replace('card-config-', '');
            const enabled = item.querySelector('.enable-card').checked;
            
            if (enabled) {
                const title = item.querySelector('.card-title').value || objectName;
                const value = item.querySelector('.card-value').value;
                const unit = item.querySelector('.card-unit').value;
                const icon = item.querySelector('.card-icon').value;
                const color = item.querySelector('.card-color').value;
                const colorOpacity = parseFloat(item.querySelector('.card-color-opacity').value) / 100;
                const bgcolor = item.querySelector('.card-bgcolor').value;
                const bgcolorOpacity = parseFloat(item.querySelector('.card-bgcolor-opacity').value) / 100;
                
                // 将颜色和透明度合并为RGBA格式
                const hexToRgb = (hex) => {
                    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                    return result ? {
                        r: parseInt(result[1], 16),
                        g: parseInt(result[2], 16),
                        b: parseInt(result[3], 16)
                    } : null;
                };
                
                const rgbColor = hexToRgb(color);
                const rgbBgcolor = hexToRgb(bgcolor);
                
                const rgbaColor = rgbColor ? `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${colorOpacity})` : 'rgba(0, 0, 0, 1)';
                const rgbaBgcolor = rgbBgcolor ? `rgba(${rgbBgcolor.r}, ${rgbBgcolor.g}, ${rgbBgcolor.b}, ${bgcolorOpacity})` : 'rgba(255, 255, 255, 1)';
                
                // 构建顶牌内容，支持多行
                let content = [];
                if (title) content.push(title);
                if (value) {
                    if (unit) {
                        content.push(`${value} ${unit}`);
                    } else {
                        content.push(value);
                    }
                }
                
                // 保存完整的配置信息
                newCardsData[objectName] = {
                    content: content.join('\n'),
                    title: title,
                    value: value,
                    unit: unit,
                    icon: icon,
                    color: rgbaColor,
                    bgcolor: rgbaBgcolor,
                    // 保存原始颜色和透明度值，用于重新加载配置时填充编辑器
                    originalColor: color,
                    originalColorOpacity: colorOpacity,
                    originalBgcolor: bgcolor,
                    originalBgcolorOpacity: bgcolorOpacity
                };
                
                console.log(`配置对象 ${objectName}:`, newCardsData[objectName]);
            }
        });
        
        // 更新模型顶牌数据
        this.modelCardsData = newCardsData;
        
        // 确保显示顶牌选项已启用
        const showCardsCheckbox = this.editPanel.querySelector('#show-cards');
        if (showCardsCheckbox) {
            showCardsCheckbox.checked = true;
        }
        
        // 立即更新顶牌显示
        this.updateModelSprites();
        
        this.showNotification(`已应用 ${Object.keys(newCardsData).length} 个顶牌配置`);
        console.log('顶牌配置应用完成，总数:', Object.keys(newCardsData).length);
    }
    
    // 更新模型顶牌
    updateModelSprites() {
        // 清除旧的顶牌
        this.modelSprites.forEach(sprite => {
            this.scene.remove(sprite);
        });
        this.modelSprites.clear();

        if (!this.currentModel || Object.keys(this.modelCardsData).length === 0) return;

        // 遍历模型中的所有对象
        this.currentModel.traverse((object) => {
            if (object.isMesh && this.modelCardsData[object.name]) {
                this.createModelSprite(object, this.modelCardsData[object.name]);
            }
        });
    }
    
    // 创建模型顶牌
    createModelSprite(object, cardConfig) {
        // 创建画布
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // 设置画布样式
        const padding = 10;
        const fontSize = 14;
        context.font = `${fontSize}px Arial`;
        
        // 处理多行文本
        const textLines = cardConfig.content.split('\n');
        let maxTextWidth = 0;
        
        textLines.forEach(line => {
            const lineWidth = context.measureText(line).width;
            maxTextWidth = Math.max(maxTextWidth, lineWidth);
        });
        
        // 计算是否需要显示图标
        const hasIcon = cardConfig.icon && cardConfig.icon.trim() !== '';
        const iconSize = 30;
        
        // 设置画布尺寸
        canvas.width = Math.max(maxTextWidth + padding * 2, hasIcon ? maxTextWidth + iconSize + padding * 3 : padding * 2);
        canvas.height = Math.max((fontSize * textLines.length) + padding * 2, iconSize + padding * 2);
        
        // 绘制背景
        context.fillStyle = cardConfig.bgcolor || 'rgba(255, 255, 255, 1)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // 绘制文字
        context.fillStyle = cardConfig.color || 'rgba(0, 0, 0, 1)';
        context.textAlign = hasIcon ? 'left' : 'center';
        context.textBaseline = 'middle';
        
        const textXOffset = hasIcon ? iconSize + padding * 2 : padding;
        const textStartY = (canvas.height - (fontSize * textLines.length)) / 2;
        
        textLines.forEach((line, index) => {
            const yPosition = textStartY + fontSize * 0.5 + index * fontSize;
            const xPosition = hasIcon ? textXOffset : canvas.width / 2;
            context.fillText(line, xPosition, yPosition);
        });
        
        // 创建纹理
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        // 创建精灵材质 - 确保精灵始终面向摄像机
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        
        // 创建精灵
        const sprite = new THREE.Sprite(material);
        sprite.userData.modelName = object.name;
        sprite.userData.cardConfig = cardConfig;
        sprite.userData.targetObject = object; // 保存对目标对象的引用
        
        // 如果有图标，创建图像对象并异步加载
        if (hasIcon) {
            const img = new Image();
            img.onload = () => {
                // 重新绘制背景
                context.fillStyle = cardConfig.bgcolor || 'rgba(255, 255, 255, 1)';
                context.fillRect(0, 0, canvas.width, canvas.height);
                
                // 绘制图标
                const iconX = padding;
                const iconY = (canvas.height - iconSize) / 2;
                context.save();
                context.globalAlpha = 1; // 确保图标完全不透明
                context.drawImage(img, iconX, iconY, iconSize, iconSize);
                context.restore();
                
                // 重新绘制文字
                context.fillStyle = cardConfig.color || 'rgba(0, 0, 0, 1)';
                context.textAlign = 'left';
                context.textBaseline = 'middle';
                
                textLines.forEach((line, index) => {
                    const yPosition = textStartY + fontSize * 0.5 + index * fontSize;
                    context.fillText(line, textXOffset, yPosition);
                });
                
                // 更新纹理
                if (material.map) {
                    material.map.needsUpdate = true;
                }
            };
            
            img.onerror = (error) => {
                console.warn(`无法加载图标: ${error}`);
            };
            
            img.src = cardConfig.icon;
        }
        
        // 设置精灵位置（在物体顶部最高点）
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxY = box.max.y; // 获取物体的最高点Y坐标
        
        // 设置位置在物体最高点上方，增加一个小偏移量
        const offsetY = size.y * 0.1; // 偏移量基于模型高度
        sprite.position.set(center.x, maxY + offsetY, center.z);
        
        // 设置精灵大小
        const scale = Math.max(size.x, size.z) * (this.cardScaleFactor || 1);
        sprite.scale.set(canvas.width * scale * 0.005, canvas.height * scale * 0.005, 1);
        
        // 添加到场景
        this.scene.add(sprite);
        this.modelSprites.set(object.name, sprite);
        
        console.log(`已为对象 ${object.name} 创建顶牌`);
    }

    // 播放动画
    playAnimation(animationName) {
        if (!this.mixer || this.animations.length === 0) return;

        // 停止所有动画
        this.mixer.stopAllAction();

        // 查找并播放指定动画
        const animation = animationName 
            ? this.animations.find(anim => anim.name === animationName)
            : this.animations[0];

        if (animation) {
            const action = this.mixer.clipAction(animation);
            action.play();
        }
    }

    // 停止动画
    stopAnimation() {
        if (this.mixer) {
            this.mixer.stopAllAction();
        }
    }

    // 切换漫游模式
    toggleWalkthroughMode() {
        this.isWalkthroughMode = !this.isWalkthroughMode;

        if (this.isWalkthroughMode) {
            this.enterWalkthroughMode();
        } else {
            this.exitWalkthroughMode();
        }
    }

    // 进入漫游模式
    enterWalkthroughMode() {
        // 保存当前控制器状态
        if (this.controls) {
            this.controls.enabled = false;
        }

        // 创建PointerLockControls
        if (!this.pointerLockControls) {
            this.pointerLockControls = new THREE.PointerLockControls(this.camera, this.renderer.domElement);
            this.scene.add(this.pointerLockControls.getObject());
        }

        // 启用PointerLockControls
        this.pointerLockControls.enabled = true;
        this.pointerLockControls.lock();

        // 设置初始位置
        const initialPosition = new THREE.Vector3(0, 1.6, 5);
        this.pointerLockControls.getObject().position.copy(initialPosition);
    }

    // 退出漫游模式
    exitWalkthroughMode() {
        // 禁用PointerLockControls
        if (this.pointerLockControls) {
            this.pointerLockControls.unlock();
            this.pointerLockControls.enabled = false;
        }

        // 恢复OrbitControls
        if (this.controls) {
            this.controls.enabled = true;
            this.controls.update();
        }
    }

    // 切换顶视图
    toggleTopView() {
        this.isTopView = !this.isTopView;

        if (this.isTopView) {
            this.enterTopView();
        } else {
            this.exitTopView();
        }
    }

    // 进入顶视图
    enterTopView() {
        // 保存当前相机状态
        this.lastCameraPos = this.camera.position.clone();
        if (this.controls) {
            this.lastCameraTarget = this.controls.target.clone();
        }

        // 计算合适的顶视图高度
        if (this.currentModel) {
            const box = new THREE.Box3().setFromObject(this.currentModel);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const height = Math.max(size.x, size.z) * 1.5;

            // 设置顶视图位置
            new TWEEN.Tween(this.camera.position)
                .to(new THREE.Vector3(center.x, height, center.z), 500)
                .easing(TWEEN.Easing.Quadratic.Out)
                .start();

            // 设置控制器目标
            if (this.controls) {
                this.controls.target.copy(center);
                this.controls.update();
            }
        }
    }

    // 退出顶视图
    exitTopView() {
        if (this.lastCameraPos && this.controls && this.lastCameraTarget) {
            // 恢复相机位置
            new TWEEN.Tween(this.camera.position)
                .to(this.lastCameraPos, 500)
                .easing(TWEEN.Easing.Quadratic.Out)
                .start();

            // 恢复控制器目标
            this.controls.target.copy(this.lastCameraTarget);
            this.controls.update();
        }
    }

    // 启动渲染循环
    startRenderLoop() {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

            // 更新时间
            const currentTime = performance.now();
            const deltaTime = (currentTime - this.prevTime) / 1000;
            this.prevTime = currentTime;

            // 更新控制器
            if (this.controls) {
                this.controls.update();
            }

            // 更新动画混合器
            if (this.mixer) {
                this.mixer.update(deltaTime);
            }

            // 更新TWEEN动画
            TWEEN.update();

            // 更新漫游模式移动
            if (this.isWalkthroughMode && this.pointerLockControls) {
                this.updateWalkthroughMovement(deltaTime);
            }
            
            // 更新顶牌位置和朝向
            this.updateSprites();

            // 渲染
            if (this.composer && this.outlinePass) {
                this.composer.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        };

        animate();
    }

    // 更新漫游模式移动
    updateWalkthroughMovement(deltaTime) {
        const velocity = new THREE.Vector3();
        const direction = new THREE.Vector3();

        direction.z = Number(this.moveForward) - Number(this.moveBackward);
        direction.x = Number(this.moveRight) - Number(this.moveLeft);
        direction.normalize();

        velocity.x = direction.x * this.moveSpeed;
        velocity.z = direction.z * this.moveSpeed;

        this.pointerLockControls.moveRight(-velocity.x * deltaTime * 100);
        this.pointerLockControls.moveForward(-velocity.z * deltaTime * 100);

        // 保持在地面上
        const pos = this.pointerLockControls.getObject().position;
        pos.y = Math.max(pos.y, 1.6); // 保持一定高度
    }

    // 显示加载进度
    showLoadingProgress(percent) {
        let loadingIndicator = document.getElementById('loading-indicator');
        if (!loadingIndicator) {
            loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'loading-indicator';
            loadingIndicator.style.position = 'absolute';
            loadingIndicator.style.top = '50%';
            loadingIndicator.style.left = '50%';
            loadingIndicator.style.transform = 'translate(-50%, -50%)';
            loadingIndicator.style.color = 'white';
            loadingIndicator.style.fontSize = '18px';
            loadingIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            loadingIndicator.style.padding = '20px';
            loadingIndicator.style.borderRadius = '5px';
            this.container.appendChild(loadingIndicator);
        }

        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = `正在加载模型... ${percent.toFixed(1)}%`;
    }

    // 隐藏加载进度
    hideLoadingProgress() {
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
    
    // 隐藏容器封面 - 增强版
    hideContainerCover() {
        console.log('开始隐藏容器封面（增强版）');
        
        // 强隐藏函数 - 使用多种方式确保元素不可见
        const stronglyHideElement = (element, description) => {
            if (element) {
                // 设置多种隐藏样式确保元素不可见
                element.style.display = 'none';
                element.style.visibility = 'hidden';
                element.style.opacity = '0';
                element.style.pointerEvents = 'none';
                element.style.position = 'absolute';
                element.style.zIndex = '-1';
                element.style.width = '0';
                element.style.height = '0';
                console.log('已隐藏元素:', description, element);
                return true;
            }
            return false;
        };
        
        // 1. 直接针对截图中的封面容器结构进行隐藏
        // 查找带有ax-default image-transition类和axp-cltf数据标签的div
        const mainCoverContainers = this.container.querySelectorAll('.ax-default.image-transition, [data-label="axp-cltf"]');
        mainCoverContainers.forEach(container => {
            stronglyHideElement(container, '主封面容器');
        });
        
        // 2. 隐藏封面容器内的所有子元素
        mainCoverContainers.forEach(container => {
            const children = Array.from(container.children);
            children.forEach(child => {
                stronglyHideElement(child, '封面子元素');
            });
        });
        
        // 3. 直接隐藏所有img元素
        const allImages = this.container.querySelectorAll('img');
        allImages.forEach(img => {
            stronglyHideElement(img, '图片元素');
        });
        
        // 4. 隐藏所有带有text类的元素
        const textElements = this.container.querySelectorAll('.text');
        textElements.forEach(text => {
            stronglyHideElement(text, '文本元素');
        });
        
        // 5. 查找并隐藏所有非canvas元素
        const nonCanvasElements = this.container.querySelectorAll('*:not(canvas):not(#loading-indicator)');
        nonCanvasElements.forEach(element => {
            // 避免隐藏我们自己创建的UI元素
            if (!element.id || !element.id.startsWith('glb-')) {
                stronglyHideElement(element, '非Canvas元素');
            }
        });
        
        // 6. 特殊处理：找到canvas元素，并将其移到最前面
        const canvasElement = this.container.querySelector('canvas');
        if (canvasElement) {
            // 确保canvas可见且在最上层
            canvasElement.style.display = 'block';
            canvasElement.style.visibility = 'visible';
            canvasElement.style.opacity = '1';
            canvasElement.style.pointerEvents = 'auto';
            canvasElement.style.position = 'relative';
            canvasElement.style.zIndex = '1000';
            canvasElement.style.width = '100%';
            canvasElement.style.height = '100%';
            
            // 将canvas移到容器的最后面，确保它在视觉上最上层
            canvasElement.parentNode.appendChild(canvasElement);
            
            console.log('已确保Canvas可见并置顶:', canvasElement);
        }
        
        // 7. 确保渲染器元素可见且可以接收交互
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.style.visibility = 'visible';
            this.renderer.domElement.style.display = 'block';
            this.renderer.domElement.style.opacity = '1';
            this.renderer.domElement.style.pointerEvents = 'auto';
            this.renderer.domElement.style.position = 'relative';
            this.renderer.domElement.style.zIndex = '1000';
            this.renderer.domElement.style.width = '100%';
            this.renderer.domElement.style.height = '100%';
            console.log('确保渲染器可见:', this.renderer.domElement);
        }
        
        console.log('容器封面隐藏操作完成（增强版）');
    }

    // 显示错误信息
    showError(message) {
        let errorElement = document.getElementById('error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'error-message';
            errorElement.style.position = 'absolute';
            errorElement.style.top = '20px';
            errorElement.style.left = '50%';
            errorElement.style.transform = 'translateX(-50%)';
            errorElement.style.color = 'white';
            errorElement.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
            errorElement.style.padding = '15px 20px';
            errorElement.style.borderRadius = '5px';
            errorElement.style.zIndex = '1000';
            this.container.appendChild(errorElement);
        }

        errorElement.textContent = message;
        errorElement.style.display = 'block';

        // 3秒后自动隐藏
        setTimeout(() => {
            if (errorElement) {
                errorElement.style.display = 'none';
            }
        }, 3000);
    }

    // 创建测试按钮
    createTestButton() {
        const testButton = document.createElement('button');
        testButton.textContent = '显示设置面板';
        testButton.style.position = 'absolute';
        testButton.style.top = '10px';
        testButton.style.left = '10px';
        testButton.style.zIndex = '1000';
        testButton.style.padding = '8px 16px';
        testButton.style.backgroundColor = '#4CAF50';
        testButton.style.color = 'white';
        testButton.style.border = 'none';
        testButton.style.borderRadius = '4px';
        testButton.style.cursor = 'pointer';
        
        testButton.addEventListener('click', () => {
            console.log('测试按钮点击，强制显示编辑面板');
            if (!this.editPanel) {
                this.createEditPanel();
            } else {
                this.editPanel.style.display = 'block';
                console.log('面板已显示');
            }
            this.updatePanelSettings();
        });
        
        document.body.appendChild(testButton);
    }
    
    // 通知Axure准备就绪
    notifyAxureReady() {
        if (typeof window.parent !== 'undefined' && window.parent.postMessage) {
            window.parent.postMessage({ command: 'viewerReady' }, '*');
        }
    }

    // 切换编辑面板
    toggleEditPanel(forceShow = false) {
        console.log('切换编辑面板显示状态...', '强制显示:', forceShow);
        // 如果编辑面板不存在，创建它
        if (!this.editPanel) {
            this.createEditPanel();
        } else {
            // 如果是强制显示或者面板当前是隐藏状态，则显示面板
            if (forceShow || this.editPanel.style.display === 'none' || !this.editPanel.style.display) {
                this.editPanel.style.display = 'block';
                console.log('面板已显示');
            } else {
                // 只有在非强制显示时才隐藏面板
                this.editPanel.style.display = 'none';
                console.log('面板已隐藏');
            }
        }
        // 更新面板中的所有设置
        this.updatePanelSettings();
    }
    
    // 更新面板中的所有设置
    updatePanelSettings() {
        if (!this.editPanel) return;
        
        // 更新模型URL
        const urlInput = this.editPanel.querySelector('#model-url-input');
        if (urlInput) {
            urlInput.value = this.modelUrl || '';
        }
        
        // 更新相机位置
        this.updateCameraInputs();
        
        // 更新动画列表
        this.updateAnimationList();
        
        // 初始化灯光强度显示
        const ambientLightValue = this.editPanel.querySelector('#ambient-light-value');
        if (ambientLightValue) {
            ambientLightValue.textContent = this.editPanel.querySelector('#ambient-light-intensity').value;
        }
        
        const directionalLightValue = this.editPanel.querySelector('#directional-light-value');
        if (directionalLightValue) {
            directionalLightValue.textContent = this.editPanel.querySelector('#directional-light-intensity').value;
        }
        
        // 初始化自动旋转速度显示
        const autoRotateSpeedValue = this.editPanel.querySelector('#auto-rotate-speed-value');
        if (autoRotateSpeedValue) {
            autoRotateSpeedValue.textContent = this.editPanel.querySelector('#auto-rotate-speed').value;
        }
        
        // 初始化顶牌缩放显示
        const cardScaleValue = this.editPanel.querySelector('#card-scale-value');
        if (cardScaleValue) {
            cardScaleValue.textContent = this.editPanel.querySelector('#card-scale').value;
        }
    }
    
    // 更新相机输入框
    updateCameraInputs() {
        if (!this.editPanel || !this.camera || !this.controls) return;
        
        // 更新相机位置输入
        this.editPanel.querySelector('#camera-pos-x').value = this.camera.position.x.toFixed(1);
        this.editPanel.querySelector('#camera-pos-y').value = this.camera.position.y.toFixed(1);
        this.editPanel.querySelector('#camera-pos-z').value = this.camera.position.z.toFixed(1);
        
        // 更新相机目标输入
        this.editPanel.querySelector('#camera-target-x').value = this.controls.target.x.toFixed(1);
        this.editPanel.querySelector('#camera-target-y').value = this.controls.target.y.toFixed(1);
        this.editPanel.querySelector('#camera-target-z').value = this.controls.target.z.toFixed(1);
    }
    
    // 应用相机设置
    applyCameraSettings() {
        if (!this.editPanel || !this.camera || !this.controls) return;
        
        // 获取输入值
        const posX = parseFloat(this.editPanel.querySelector('#camera-pos-x').value);
        const posY = parseFloat(this.editPanel.querySelector('#camera-pos-y').value);
        const posZ = parseFloat(this.editPanel.querySelector('#camera-pos-z').value);
        const targetX = parseFloat(this.editPanel.querySelector('#camera-target-x').value);
        const targetY = parseFloat(this.editPanel.querySelector('#camera-target-y').value);
        const targetZ = parseFloat(this.editPanel.querySelector('#camera-target-z').value);
        
        // 检查值是否有效
        if (isNaN(posX) || isNaN(posY) || isNaN(posZ) || 
            isNaN(targetX) || isNaN(targetY) || isNaN(targetZ)) {
            console.error('无效的相机参数');
            return;
        }
        
        // 应用相机位置
        this.camera.position.set(posX, posY, posZ);
        
        // 应用相机目标
        this.controls.target.set(targetX, targetY, targetZ);
        this.controls.update();
    }
    
    // 更新动画列表
    updateAnimationList() {
        const animationList = this.editPanel.querySelector('#animation-list');
        if (!animationList || !this.animations || this.animations.length === 0) {
            animationList.innerHTML = '<p style="margin: 5px 0; font-size: 12px; color: #aaa; text-align: center;">无动画可用</p>';
            return;
        }
        
        // 清空列表并添加动画项
        let html = '';
        this.animations.forEach((animation, index) => {
            html += `
                <div style="padding: 5px; margin-bottom: 5px; background: #333; border-radius: 3px; display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 12px; margin-right: 10px;">${animation.name || `动画 ${index + 1}`}</span>
                    <div>
                        <button data-index="${index}" class="play-animation-btn" style="padding: 3px 8px; background: #4CAF50; border: none; color: white; cursor: pointer; border-radius: 3px; margin-right: 5px; font-size: 10px;">播放</button>
                        <button data-index="${index}" class="stop-animation-btn" style="padding: 3px 8px; background: #f44336; border: none; color: white; cursor: pointer; border-radius: 3px; font-size: 10px;">停止</button>
                    </div>
                </div>
            `;
        });
        
        animationList.innerHTML = html;
        
        // 添加动画按钮事件监听
        animationList.querySelectorAll('.play-animation-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (this.animations[index]) {
                    this.playAnimation(this.animations[index].name);
                }
            });
        });
        
        animationList.querySelectorAll('.stop-animation-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.stopAnimation();
            });
        });
    }
    
    // 更新环境光
    updateAmbientLight(intensity) {
        if (!this.scene) return;
        
        // 查找环境光
        this.scene.traverse(obj => {
            if (obj.isAmbientLight) {
                obj.intensity = intensity;
            }
        });
    }
    
    // 更新方向光
    updateDirectionalLight(intensity) {
        if (!this.scene) return;
        
        // 查找方向光
        this.scene.traverse(obj => {
            if (obj.isDirectionalLight) {
                obj.intensity = intensity;
            }
        });
    }
    
    // 切换网格显示
    toggleGrid(show) {
        if (!this.scene) return;
        
        // 查找网格辅助
        this.scene.traverse(obj => {
            if (obj.isGridHelper) {
                obj.visible = show;
            }
        });
    }
    
    // 切换自动旋转
    toggleAutoRotate(enabled) {
        if (!this.controls) return;
        this.controls.autoRotate = enabled;
        
        // 触发事件通知Axure状态变化
        if (typeof window.parent !== 'undefined' && window.parent.postMessage) {
            window.parent.postMessage({ 
                command: 'autoRotateChanged', 
                enabled: this.controls.autoRotate 
            }, '*');
        }
        
        return this.controls.autoRotate;
    }
    
    // 导出配置信息
    exportConfiguration() {
        const config = {
            time: Math.floor(Date.now() / 1000),
            config: {
                url: this.modelUrl || '',
                autoRotate: this.controls ? this.controls.autoRotate : false,
                cameraPosition: this.camera ? [
                    this.camera.position.x,
                    this.camera.position.y,
                    this.camera.position.z
                ] : [0, 0, 0],
                isEnt: true
            },
            data: {},
            u: 'YXgxMDAwNWIx'
        };
        
        // 添加顶牌数据
        if (this.modelCardsData && Object.keys(this.modelCardsData).length > 0) {
            config.data.cardsData = this.modelCardsData;
        }
        
        // 转换为JSON字符串
        const configStr = JSON.stringify(config);
        
        // 复制到剪贴板
        navigator.clipboard.writeText(configStr).then(() => {
            this.showNotification('配置已复制到剪贴板');
        }).catch(err => {
            console.error('复制失败:', err);
            this.showNotification('复制失败，请手动复制');
            // 如果剪贴板API不可用，提供一个可选择的文本区域
            const textArea = document.createElement('textarea');
            textArea.value = configStr;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        });
        
        return configStr;
    }
    
    // 加载配置信息
    loadConfiguration(configStr) {
        try {
            // 支持传入对象或字符串
            let config = typeof configStr === 'object' ? configStr : JSON.parse(configStr);
            
            // 确保配置对象有效
            if (!config || typeof config !== 'object') {
                throw new Error('无效的配置对象');
            }
            
            console.log('加载配置:', config);
            
            // 处理嵌套配置格式
            // 兼容 {config: {...}} 和直接配置格式
            const effectiveConfig = config.config && typeof config.config === 'object' ? config.config : config;
            
            // 加载模型
            if (effectiveConfig.url) {
                console.log(`加载模型: ${effectiveConfig.url}`);
                this.loadModel(effectiveConfig.url);
            }
            
            // 设置自动旋转
            if (this.controls && effectiveConfig.autoRotate !== undefined) {
                console.log(`设置自动旋转: ${effectiveConfig.autoRotate}`);
                this.toggleAutoRotate(Boolean(effectiveConfig.autoRotate));
            }
            
            // 设置自动旋转速度
            if (this.controls && effectiveConfig.autoRotateSpeed !== undefined) {
                const speed = parseFloat(effectiveConfig.autoRotateSpeed);
                if (!isNaN(speed)) {
                    console.log(`设置自动旋转速度: ${speed}`);
                    this.setAutoRotateSpeed(speed);
                }
            }
            
            // 设置相机位置
            if (this.camera && effectiveConfig.cameraPosition) {
                const pos = Array.isArray(effectiveConfig.cameraPosition) ? 
                    effectiveConfig.cameraPosition : 
                    [effectiveConfig.cameraPosition.x, effectiveConfig.cameraPosition.y, effectiveConfig.cameraPosition.z];
                
                if (pos.length >= 3) {
                    console.log(`设置相机位置: ${pos}`);
                    this.camera.position.set(pos[0], pos[1], pos[2]);
                    if (this.controls) this.controls.update();
                }
            }
            
            // 加载顶牌数据
            if (config.data && config.data.cardsData) {
                console.log('加载顶牌数据');
                this.modelCardsData = config.data.cardsData;
                this.updateModelSprites();
            }
            
            // 设置顶牌显示
            if (effectiveConfig.showTopCards !== undefined) {
                console.log(`设置顶牌显示: ${effectiveConfig.showTopCards}`);
                this.toggleTopCards(Boolean(effectiveConfig.showTopCards));
            }
            
            // 设置顶牌缩放
            if (effectiveConfig.topCardScale !== undefined) {
                const scale = parseFloat(effectiveConfig.topCardScale);
                if (!isNaN(scale) && scale > 0) {
                    console.log(`设置顶牌缩放: ${scale}`);
                    this.setTopCardScale(scale);
                }
            }
            
            // 设置网格显示
            if (effectiveConfig.showGrid !== undefined) {
                console.log(`设置网格显示: ${effectiveConfig.showGrid}`);
                this.toggleGrid(Boolean(effectiveConfig.showGrid));
            }
            
            // 设置环境光强度
            if (effectiveConfig.environmentIntensity !== undefined) {
                const intensity = parseFloat(effectiveConfig.environmentIntensity);
                if (!isNaN(intensity)) {
                    console.log(`设置环境光强度: ${intensity}`);
                    this.updateEnvironmentLight(intensity);
                }
            }
            
            // 设置方向光强度
            if (effectiveConfig.directionalLightIntensity !== undefined) {
                const intensity = parseFloat(effectiveConfig.directionalLightIntensity);
                if (!isNaN(intensity)) {
                    console.log(`设置方向光强度: ${intensity}`);
                    this.updateDirectionalLight(intensity);
                }
            }
            
            // 设置FXAA抗锯齿
            if (effectiveConfig.fxaa !== undefined) {
                console.log(`设置FXAA: ${effectiveConfig.fxaa}`);
                this.toggleFXAA(Boolean(effectiveConfig.fxaa));
            }
            
            // 设置描边效果
            if (effectiveConfig.outline !== undefined) {
                console.log(`设置描边效果: ${effectiveConfig.outline}`);
                this.toggleOutline(Boolean(effectiveConfig.outline));
            }
            
            // 设置初始视图模式
            if (effectiveConfig.viewMode) {
                const viewMode = effectiveConfig.viewMode.toLowerCase();
                if (viewMode === 'top') {
                    console.log('设置顶视图模式');
                    this.enterTopView();
                } else if (viewMode === 'walkthrough') {
                    console.log('设置漫游模式');
                    this.enterWalkthroughMode();
                }
            }
            
            // 设置模型初始旋转
            if (effectiveConfig.modelRotation && this.modelGroup) {
                const rot = Array.isArray(effectiveConfig.modelRotation) ? 
                    effectiveConfig.modelRotation : 
                    [effectiveConfig.modelRotation.x, effectiveConfig.modelRotation.y, effectiveConfig.modelRotation.z];
                
                if (rot.length >= 3) {
                    console.log(`设置模型初始旋转: ${rot}`);
                    this.modelGroup.rotation.set(
                        rot[0] * Math.PI / 180,  // 转换为弧度
                        rot[1] * Math.PI / 180,
                        rot[2] * Math.PI / 180
                    );
                }
            }
            
            this.showNotification('配置加载成功');
            return true;
        } catch (error) {
            console.error('配置加载失败:', error);
            this.showNotification('配置加载失败: 无效的配置格式');
            return false;
        }
    }
    
    // 标准化配置数据格式
    normalizeConfig(config) {
        // 确保config是对象
        if (!config || typeof config !== 'object') {
            try {
                if (typeof config === 'string') {
                    return JSON.parse(config);
                }
            } catch (e) {
                console.warn('配置字符串解析失败:', e);
            }
            return null;
        }
        
        // 确保必要的字段存在
        if (!config.config) {
            config.config = {};
        }
        if (!config.data) {
            config.data = {};
        }
        
        // 标准化URL字段
        if (config.url && !config.config.url) {
            config.config.url = config.url;
        }
        
        // 标准化相机位置格式
        if (config.cameraPosition && Array.isArray(config.cameraPosition)) {
            config.config.cameraPosition = config.cameraPosition;
        }
        
        return config;
    }
    
    // 从Axure中继器获取配置数据
    getConfigFromRepeater() {
        try {
            // 1. 查找配置中继器
            // 先尝试查找与容器在同一分组下的中继器
            const containerGroup = this.container ? this.container.closest('[data-label]') : null;
            let configRepeater;
            
            // 尝试多种查找方式，适应Axure不同版本和结构
            const selectors = [
                '[data-label="axhub-config"]',
                '[id*="ul"][data-label="axhub-config"]',
                '[id^="ul"][data-label="axhub-config"]',
                '.ax_default[data-label="axhub-config"]',
                // 添加对asyrpt中继器的支持
                '[id="asyrpt"]',
                '[data-label="asyrpt-config"]',
                '[id="asyrpt"][data-label="asyrpt-config"]'
            ];
            
            // 先在容器组中查找
            if (containerGroup) {
                for (const selector of selectors) {
                    configRepeater = containerGroup.querySelector(selector);
                    if (configRepeater) {
                        console.log(`在容器分组中找到配置中继器: ${selector}`);
                        break;
                    }
                }
            }
            
            // 如果没有找到，尝试在整个文档中查找
            if (!configRepeater) {
                for (const selector of selectors) {
                    configRepeater = document.querySelector(selector);
                    if (configRepeater) {
                        console.log(`在文档中找到配置中继器: ${selector}`);
                        break;
                    }
                }
            }
            
            // 直接检查特定ID的元素，包括asyrpt
            if (!configRepeater && document.getElementById('asyrpt')) {
                configRepeater = document.getElementById('asyrpt');
                console.log('通过ID找到配置中继器: asyrpt');
            } else if (!configRepeater && document.getElementById('ul')) {
                const ulElement = document.getElementById('ul');
                if (ulElement.dataset && ulElement.dataset.label === 'axhub-config') {
                    configRepeater = ulElement;
                    console.log('通过ID找到配置中继器: ul');
                }
            }
            
            if (!configRepeater) {
                console.log('未找到配置中继器');
                // 记录所有可能的中继器元素，帮助调试
                const allPossibleRepeaters = document.querySelectorAll('[data-label*="config"]');
                console.log(`找到${allPossibleRepeaters.length}个可能的配置元素`);
                allPossibleRepeaters.forEach(el => {
                    console.log(`可能的配置元素: ${el.id}, data-label: ${el.dataset.label}`);
                });
                return null;
            }
            
            // 2. 多种方式尝试获取中继器数据
            
            // 方式1: 检查全局dataSets变量（这是Axure常用的数据传递方式）
            if (window.dataSets && typeof window.dataSets === 'object') {
                // 尝试不同的可能的配置键名
                const possibleKeys = ['config', 'axhub-config', 'glbConfig', 'viewerConfig'];
                for (const key of possibleKeys) {
                    if (window.dataSets[key]) {
                        console.log(`从window.dataSets.${key}获取配置`);
                        const rawConfig = window.dataSets[key];
                        const normalizedConfig = this.normalizeConfig(rawConfig);
                        if (normalizedConfig) {
                            return normalizedConfig;
                        }
                    }
                }
            }
            
            // 方式2: 尝试通过Axure内部API获取中继器数据
            if (window.$axure && window.$axure.repeater) {
                console.log('尝试通过$axure.repeater API获取数据');
                try {
                    const repeaterId = configRepeater.id;
                    // 尝试不同的API调用方式
                    let repeaterData = null;
                    
                    // 方式2.1: 直接调用getRepeaterData
                    if (window.$axure.repeater.getRepeaterData) {
                        repeaterData = window.$axure.repeater.getRepeaterData(repeaterId);
                    }
                    // 方式2.2: 通过内部映射获取
                    else if (window.$axure.repeater.repeaterToLocalDataSet) {
                        repeaterData = window.$axure.repeater.repeaterToLocalDataSet[repeaterId];
                    }
                    else if (window.$axure.repeater.repeaterToActiveDataSet) {
                        repeaterData = window.$axure.repeater.repeaterToActiveDataSet[repeaterId];
                    }
                    
                    if (repeaterData && Array.isArray(repeaterData) && repeaterData.length > 0) {
                        console.log('成功获取中继器数据，共', repeaterData.length, '条记录');
                        // 尝试从第一条记录中获取配置
                        const firstRow = repeaterData[0];
                        // 尝试不同的可能的配置字段
                        const possibleFields = ['config', 'data', 'content', 'json', 'value'];
                        // 对于asyrpt中继器，添加特定字段
                        if (repeaterId === 'asyrpt') {
                            possibleFields.push('asyrpt-config', 'configuration', 'settings');
                        }
                        
                        for (const field of possibleFields) {
                            if (firstRow[field]) {
                                console.log(`从中继器数据的${field}字段获取配置`);
                                const rawConfig = firstRow[field];
                                const normalizedConfig = this.normalizeConfig(rawConfig);
                                if (normalizedConfig) {
                                    return normalizedConfig;
                                }
                            }
                        }
                        
                        // 如果找不到特定字段，尝试将整个第一行作为配置
                        const normalizedConfig = this.normalizeConfig(firstRow);
                        if (normalizedConfig) {
                            return normalizedConfig;
                        }
                    }
                } catch (e) {
                    console.warn('通过$axure.repeater获取数据失败:', e);
                }
            }
            
            // 方式2.5: 特殊处理asyrpt中继器
            if (configRepeater.id === 'asyrpt') {
                console.log('特殊处理asyrpt中继器');
                try {
                    // 尝试直接从asyrpt元素获取配置
                    const scriptElement = configRepeater.querySelector('script');
                    if (scriptElement && scriptElement.textContent) {
                        const scriptContent = scriptElement.textContent.trim();
                        console.log('从asyrpt脚本获取内容:', scriptContent.substring(0, 100) + '...');
                        const normalizedConfig = this.normalizeConfig(scriptContent);
                        if (normalizedConfig) {
                            return normalizedConfig;
                        }
                    }
                    
                    // 检查asyrpt的子元素
                    const children = configRepeater.querySelectorAll('*');
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if (child.textContent && child.textContent.trim()) {
                            try {
                                const normalizedConfig = this.normalizeConfig(child.textContent.trim());
                                if (normalizedConfig) {
                                    console.log(`从asyrpt子元素获取配置，索引: ${i}`);
                                    return normalizedConfig;
                                }
                            } catch (e) {
                                // 继续尝试其他子元素
                            }
                        }
                    }
                } catch (e) {
                    console.warn('处理asyrpt中继器时出错:', e);
                }
            }
            
            // 方式3: 尝试解析中继器模板脚本
            const script = configRepeater.querySelector('script[type="axure-repeater-template"]');
            if (script) {
                console.log('尝试解析中继器脚本内容');
                try {
                    const scriptContent = script.textContent.trim();
                    // 尝试不同的格式匹配
                    if (scriptContent.startsWith('{') && scriptContent.endsWith('}')) {
                        // 看起来是JSON对象
                        const normalizedConfig = this.normalizeConfig(scriptContent);
                        if (normalizedConfig) {
                            return normalizedConfig;
                        }
                    }
                    
                    // 尝试查找可能包含配置的变量声明
                    const jsonMatch = scriptContent.match(/var\s+config\s*=\s*(\{[^}]*\});/);
                    if (jsonMatch && jsonMatch[1]) {
                        const normalizedConfig = this.normalizeConfig(jsonMatch[1]);
                        if (normalizedConfig) {
                            return normalizedConfig;
                        }
                    }
                } catch (e) {
                    console.warn('解析中继器脚本内容失败:', e);
                }
            }
            
            // 方式4: 检查中继器元素的data属性
            if (configRepeater.dataset) {
                console.log('尝试从data属性获取配置');
                for (const key in configRepeater.dataset) {
                    if (key.includes('config') || key.includes('data')) {
                        try {
                            const dataValue = configRepeater.dataset[key];
                            const normalizedConfig = this.normalizeConfig(dataValue);
                            if (normalizedConfig) {
                                return normalizedConfig;
                            }
                        } catch (e) {
                            console.warn(`解析data-${key}属性失败:`, e);
                        }
                    }
                }
            }
            
        } catch (e) {
            console.error('获取中继器配置时发生错误:', e);
        }
        
        return null;
    }
    
    // 尝试加载初始配置
    tryLoadInitialConfiguration() {
        // 1. 首先尝试从中继器获取配置
        try {
            const repeaterConfig = this.getConfigFromRepeater();
            if (repeaterConfig) {
                console.log('成功从Axure中继器获取配置');
                // 将配置对象转换为字符串，然后调用loadConfiguration
                const configStr = JSON.stringify(repeaterConfig);
                if (this.loadConfiguration(configStr)) {
                    console.log('配置加载成功，应用了中继器中的设置');
                    return true;
                }
            }
        } catch (e) {
            console.warn('处理中继器配置时出错:', e);
        }
        
        // 2. 如果中继器没有配置，检查URL参数
        const params = new URLSearchParams(window.location.search);
        const configParam = params.get('config');
        
        if (configParam) {
            try {
                // 尝试直接解析
                return this.loadConfiguration(configParam);
            } catch (e) {
                // 如果直接解析失败，尝试解码
                try {
                    const decoded = decodeURIComponent(configParam);
                    return this.loadConfiguration(decoded);
                } catch (e2) {
                    console.warn('无法解析URL中的配置参数');
                }
            }
        }
        
        // 3. 最后，检查是否有全局配置对象
        if (window.glbViewerConfig || window.axhubGlbConfig) {
            try {
                const globalConfig = window.glbViewerConfig || window.axhubGlbConfig;
                const configStr = JSON.stringify(globalConfig);
                return this.loadConfiguration(configStr);
            } catch (e) {
                console.warn('无法加载全局配置对象:', e);
            }
        }
        
        return false;
    }
    
    // 设置自动旋转速度
    setAutoRotateSpeed(speed) {
        if (!this.controls) return;
        this.controls.autoRotateSpeed = speed;
    }
    
    // 切换顶牌可见性
    toggleCardsVisibility(show) {
        if (!this.modelSprites) return false;
        
        this.modelSprites.forEach(sprite => {
            sprite.visible = show;
        });
        
        // 触发事件通知Axure状态变化
        if (typeof window.parent !== 'undefined' && window.parent.postMessage) {
            window.parent.postMessage({ 
                command: 'showCardsChanged', 
                enabled: show 
            }, '*');
        }
        
        return show;
    }
    
    // 设置顶牌缩放
    setCardScale(scale) {
        if (!this.modelSprites || !this.currentModel) return;
        
        this.cardScaleFactor = scale;
        this.updateModelSprites();
    }
    
    // 切换描边效果
    toggleOutline(enabled) {
        if (!this.outlinePass) return;
        
        // 启用或禁用描边通道
        if (enabled) {
            this.outlinePass.visibleEdgeColor.set(0x00ff00);
        } else {
            this.outlinePass.visibleEdgeColor.set(0x000000);
        }
    }
    
    // 切换FXAA抗锯齿
    toggleFXAA(enabled) {
        // 这里简化处理，实际可能需要更复杂的通道管理
        console.log(`FXAA ${enabled ? '启用' : '禁用'}`);
        // 可以在setupPostProcessing方法中优化实现
    }
    
    // 创建编辑面板
    createEditPanel() {
        console.log('创建编辑面板...');
        this.editPanel = document.createElement('div');
        this.editPanel.id = 'glb-edit-panel';
        
        // 设置面板样式
        this.editPanel.style.position = 'absolute';
        this.editPanel.style.top = '20px';
        this.editPanel.style.right = '20px';
        this.editPanel.style.width = '400px';
        this.editPanel.style.maxHeight = '80vh';
        this.editPanel.style.overflowY = 'auto';
        this.editPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        this.editPanel.style.color = 'white';
        this.editPanel.style.padding = '20px';
        this.editPanel.style.borderRadius = '8px';
        this.editPanel.style.zIndex = '9999';
        this.editPanel.style.display = 'none'; // 默认隐藏，Alt+左键点击显示
        this.editPanel.style.fontFamily = 'Arial, sans-serif';
        this.editPanel.style.border = '2px solid #00ffff';
        this.editPanel.style.boxShadow = '0 4px 20px rgba(0, 255, 255, 0.5)';
        this.editPanel.style.fontSize = '14px';
        
        // 添加面板内容
        this.editPanel.innerHTML = `
            <div style="margin-bottom: 20px; border-bottom: 1px solid #444; padding-bottom: 10px;">
                <h3 style="margin-top: 0; margin-bottom: 10px;">模型编辑面板</h3>
                <p style="margin: 0; font-size: 12px; color: #aaa;">Alt + 左键单击可切换此面板</p>
            </div>
            
            <!-- 模型URL配置 -->
            <div style="margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">模型配置</h4>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">模型URL:</label>
                    <input 
                        id="model-url-input" 
                        type="text" 
                        style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: white; box-sizing: border-box;"
                        placeholder="输入模型URL"
                    >
                </div>
                <button 
                    id="load-model-btn" 
                    style="width: 100%; padding: 10px; background: #4CAF50; border: none; color: white; cursor: pointer; border-radius: 4px;"
                >
                    加载模型
                </button>
            </div>
            
            <!-- 相机位置配置 -->
            <div style="margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">相机位置</h4>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 5px; font-size: 12px;">位置 X:</label>
                        <input 
                            id="camera-pos-x" 
                            type="number" 
                            step="0.1" 
                            style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; color: white; box-sizing: border-box;"
                        >
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 5px; font-size: 12px;">位置 Y:</label>
                        <input 
                            id="camera-pos-y" 
                            type="number" 
                            step="0.1" 
                            style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; color: white; box-sizing: border-box;"
                        >
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 5px; font-size: 12px;">位置 Z:</label>
                        <input 
                            id="camera-pos-z" 
                            type="number" 
                            step="0.1" 
                            style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; color: white; box-sizing: border-box;"
                        >
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 5px; font-size: 12px;">目标 X:</label>
                        <input 
                            id="camera-target-x" 
                            type="number" 
                            step="0.1" 
                            style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; color: white; box-sizing: border-box;"
                        >
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 5px; font-size: 12px;">目标 Y:</label>
                        <input 
                            id="camera-target-y" 
                            type="number" 
                            step="0.1" 
                            style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; color: white; box-sizing: border-box;"
                        >
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 5px; font-size: 12px;">目标 Z:</label>
                        <input 
                            id="camera-target-z" 
                            type="number" 
                            step="0.1" 
                            style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; color: white; box-sizing: border-box;"
                        >
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button 
                        id="apply-camera-btn" 
                        style="flex: 1; padding: 8px; background: #2196F3; border: none; color: white; cursor: pointer; border-radius: 4px;"
                    >
                        应用相机设置
                    </button>
                    <button 
                        id="reset-camera-btn" 
                        style="flex: 1; padding: 8px; background: #FF9800; border: none; color: white; cursor: pointer; border-radius: 4px;"
                    >
                        重置相机
                    </button>
                    <button 
                        id="get-current-camera-btn" 
                        style="flex: 1; padding: 8px; background: #4CAF50; border: none; color: white; cursor: pointer; border-radius: 4px;"
                    >
                        获取当前视角
                    </button>
                </div>
            </div>
            
            <!-- 灯光配置 -->
            <div style="margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">灯光设置</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px;">环境光强度:</label>
                    <input 
                        id="ambient-light-intensity" 
                        type="range" 
                        min="0" 
                        max="2" 
                        step="0.1" 
                        value="1"
                        style="width: 100%;"
                    >
                    <span id="ambient-light-value" style="display: block; text-align: right; color: #aaa; font-size: 12px;">1.0</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px;">方向光强度:</label>
                    <input 
                        id="directional-light-intensity" 
                        type="range" 
                        min="0" 
                        max="3" 
                        step="0.1" 
                        value="1.5"
                        style="width: 100%;"
                    >
                    <span id="directional-light-value" style="display: block; text-align: right; color: #aaa; font-size: 12px;">1.5</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input 
                            id="show-grid" 
                            type="checkbox" 
                            checked
                        >
                        显示地面网格
                    </label>
                </div>
            </div>
            
            <!-- 动画控制 -->
            <div style="margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">动画控制</h4>
                <div id="animation-list" style="margin-bottom: 10px; max-height: 150px; overflow-y: auto; padding: 5px; background: #222; border-radius: 4px;">
                    <p style="margin: 5px 0; font-size: 12px; color: #aaa; text-align: center;">无动画可用</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button 
                        id="play-all-animations" 
                        style="flex: 1; padding: 8px; background: #4CAF50; border: none; color: white; cursor: pointer; border-radius: 4px;"
                    >
                        播放所有动画
                    </button>
                    <button 
                        id="stop-all-animations" 
                        style="flex: 1; padding: 8px; background: #f44336; border: none; color: white; cursor: pointer; border-radius: 4px;"
                    >
                        停止所有动画
                    </button>
                </div>
            </div>
            
            <!-- 视图控制 -->
            <div style="margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">视图控制</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input 
                            id="auto-rotate" 
                            type="checkbox"
                        >
                        自动旋转
                    </label>
                </div>
                <div style="display: none; margin-bottom: 10px;" id="auto-rotate-speed-container">
                    <label style="display: block; margin-bottom: 5px;">旋转速度:</label>
                    <input 
                        id="auto-rotate-speed" 
                        type="range" 
                        min="0.1" 
                        max="5" 
                        step="0.1" 
                        value="1"
                        style="width: 100%;"
                    >
                    <span id="auto-rotate-speed-value" style="display: block; text-align: right; color: #aaa; font-size: 12px;">1.0</span>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <button 
                        id="toggle-top-view" 
                        style="flex: 1; padding: 8px; background: #9C27B0; border: none; color: white; cursor: pointer; border-radius: 4px;"
                    >
                        顶视图
                    </button>
                    <button 
                        id="toggle-walkthrough" 
                        style="flex: 1; padding: 8px; background: #607D8B; border: none; color: white; cursor: pointer; border-radius: 4px;"
                    >
                        漫游模式
                    </button>
                </div>
            </div>
            
            <!-- 顶牌设置 -->
            <div style="margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">顶牌设置</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input 
                            id="show-cards" 
                            type="checkbox" 
                            checked
                        >
                        显示顶牌
                    </label>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px;">顶牌缩放:</label>
                    <input 
                        id="card-scale" 
                        type="range" 
                        min="0.1" 
                        max="3" 
                        step="0.1" 
                        value="1"
                        style="width: 100%;"
                    >
                    <span id="card-scale-value" style="display: block; text-align: right; color: #aaa; font-size: 12px;">1.0</span>
                </div>
                <button 
                    id="edit-cards-btn" 
                    style="width: 100%; padding: 8px; background: #3F51B5; border: none; color: white; cursor: pointer; border-radius: 4px; margin-bottom: 10px;"
                >
                    编辑顶牌内容
                </button>
                <div id="cards-editor" style="display: none; max-height: 300px; overflow-y: auto; padding: 10px; background: #222; border-radius: 4px; margin-bottom: 10px;">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #ddd;">模型对象列表：</label>
                        <select id="model-objects" multiple style="width: 100%; height: 100px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; padding: 5px;">
                            <!-- 动态填充模型对象 -->
                        </select>
                        <button id="add-card-config" style="width: 100%; margin-top: 8px; padding: 6px; background: #4CAF50; border: none; color: white; cursor: pointer; border-radius: 4px; font-size: 12px;">
                            添加选中对象
                        </button>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <h5 style="margin: 0 0 10px 0; font-size: 14px; color: #ddd;">顶牌配置列表：</h5>
                        <div id="card-config-list" style="display: flex; flex-direction: column; gap: 10px;">
                            <!-- 动态填充配置项 -->
                        </div>
                    </div>
                    
                    <button id="apply-card-configs" style="width: 100%; padding: 8px; background: #2196F3; border: none; color: white; cursor: pointer; border-radius: 4px; font-size: 14px;">
                        应用所有顶牌配置
                    </button>
                </div>
            </div>
            
            <!-- 后处理效果 -->
            <div style="margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">后处理效果</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input 
                            id="enable-outline" 
                            type="checkbox" 
                            checked
                        >
                        启用描边
                    </label>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input 
                            id="enable-fxaa" 
                            type="checkbox" 
                            checked
                        >
                        启用抗锯齿
                    </label>
                </div>
            </div>
            
            <!-- 关闭按钮 -->
            <button 
                id="close-panel-btn" 
                style="width: 100%; padding: 12px; background: #666; border: none; color: white; cursor: pointer; border-radius: 4px;"
            >
                关闭面板
            </button>
        `;
        
        // 添加事件监听器
        this.editPanel.querySelector('#load-model-btn').addEventListener('click', () => {
            const urlInput = this.editPanel.querySelector('#model-url-input');
            if (urlInput && urlInput.value.trim()) {
                this.loadModel(urlInput.value.trim());
            }
        });
        
        this.editPanel.querySelector('#close-panel-btn').addEventListener('click', () => {
            this.editPanel.style.display = 'none';
        });
        
        // 相机位置事件监听器
        this.editPanel.querySelector('#apply-camera-btn').addEventListener('click', () => {
            this.applyCameraSettings();
        });
        
        this.editPanel.querySelector('#reset-camera-btn').addEventListener('click', () => {
            if (this.currentModel) {
                this.autoPositionCameraAndControls(this.currentModel);
                this.updateCameraInputs();
            }
        });
        
        // 获取当前相机位置按钮事件
        this.editPanel.querySelector('#get-current-camera-btn').addEventListener('click', () => {
            this.getCurrentCameraPosition();
        });
        
        // 灯光控制事件监听器
        const ambientLightSlider = this.editPanel.querySelector('#ambient-light-intensity');
        const ambientLightValue = this.editPanel.querySelector('#ambient-light-value');
        ambientLightSlider.addEventListener('input', () => {
            ambientLightValue.textContent = ambientLightSlider.value;
            this.updateAmbientLight(parseFloat(ambientLightSlider.value));
        });
        
        const directionalLightSlider = this.editPanel.querySelector('#directional-light-intensity');
        const directionalLightValue = this.editPanel.querySelector('#directional-light-value');
        directionalLightSlider.addEventListener('input', () => {
            directionalLightValue.textContent = directionalLightSlider.value;
            this.updateDirectionalLight(parseFloat(directionalLightSlider.value));
        });
        
        this.editPanel.querySelector('#show-grid').addEventListener('change', (e) => {
            this.toggleGrid(e.target.checked);
        });
        
        // 动画控制事件监听器
        this.editPanel.querySelector('#play-all-animations').addEventListener('click', () => {
            if (this.animations && this.animations.length > 0) {
                this.playAnimation(null); // 播放第一个动画
            }
        });
        
        this.editPanel.querySelector('#stop-all-animations').addEventListener('click', () => {
            this.stopAnimation();
        });
        
        // 视图控制事件监听器
        const autoRotateCheckbox = this.editPanel.querySelector('#auto-rotate');
        const autoRotateSpeedContainer = this.editPanel.querySelector('#auto-rotate-speed-container');
        
        autoRotateCheckbox.addEventListener('change', (e) => {
            this.toggleAutoRotate(e.target.checked);
            autoRotateSpeedContainer.style.display = e.target.checked ? 'block' : 'none';
        });
        
        const autoRotateSpeedSlider = this.editPanel.querySelector('#auto-rotate-speed');
        const autoRotateSpeedValue = this.editPanel.querySelector('#auto-rotate-speed-value');
        autoRotateSpeedSlider.addEventListener('input', () => {
            autoRotateSpeedValue.textContent = autoRotateSpeedSlider.value;
            this.setAutoRotateSpeed(parseFloat(autoRotateSpeedSlider.value));
        });
        
        this.editPanel.querySelector('#toggle-top-view').addEventListener('click', () => {
            this.toggleTopView();
        });
        
        this.editPanel.querySelector('#toggle-walkthrough').addEventListener('click', () => {
            this.toggleWalkthroughMode();
        });
        
        // 顶牌设置事件监听器
        this.editPanel.querySelector('#show-cards').addEventListener('change', (e) => {
            this.toggleCardsVisibility(e.target.checked);
        });
        
        const cardScaleSlider = this.editPanel.querySelector('#card-scale');
        const cardScaleValue = this.editPanel.querySelector('#card-scale-value');
        cardScaleSlider.addEventListener('input', () => {
            cardScaleValue.textContent = cardScaleSlider.value;
            this.setCardScale(parseFloat(cardScaleSlider.value));
        });
        
        this.editPanel.querySelector('#edit-cards-btn').addEventListener('click', () => {
            const cardsEditor = this.editPanel.querySelector('#cards-editor');
            cardsEditor.style.display = cardsEditor.style.display === 'none' ? 'block' : 'none';
            
            // 当打开编辑面板时，获取模型中的所有对象并更新选择列表
            if (cardsEditor.style.display === 'block') {
                this.updateObjectList();
            }
        });
        
        // 顶牌编辑相关事件
        this.editPanel.querySelector('#add-card-config').addEventListener('click', () => {
            this.addCardConfiguration();
        });
        
        this.editPanel.querySelector('#apply-card-configs').addEventListener('click', () => {
            this.applyCardConfigurations();
        });
        
        // 添加配置导入导出按钮
        const configSection = document.createElement('div');
        configSection.style.marginTop = '20px';
        configSection.innerHTML = `
            <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">配置管理</h4>
            <button id="export-config-btn" style="width: 100%; padding: 8px; background: #4CAF50; border: none; color: white; cursor: pointer; border-radius: 4px; font-size: 14px; margin-bottom: 10px;">
                导出配置到剪贴板
            </button>
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #aaa;">导入配置</label>
                <textarea id="import-config-text" placeholder="粘贴配置文本" style="width: 100%; height: 80px; padding: 4px; font-size: 12px; background: #222; border: 1px solid #555; color: white; border-radius: 3px;"></textarea>
            </div>
            <button id="import-config-btn" style="width: 100%; padding: 8px; background: #2196F3; border: none; color: white; cursor: pointer; border-radius: 4px; font-size: 14px;">
                导入配置
            </button>
        `;
        
        // 在关闭按钮前插入配置管理区域
        const closeButton = this.editPanel.querySelector('#close-panel-btn');
        this.editPanel.insertBefore(configSection, closeButton);
        
        // 添加导出配置事件
        this.editPanel.querySelector('#export-config-btn').addEventListener('click', () => {
            this.exportConfiguration();
        });
        
        // 添加导入配置事件
        this.editPanel.querySelector('#import-config-btn').addEventListener('click', () => {
            const configText = this.editPanel.querySelector('#import-config-text').value;
            if (configText) {
                this.loadConfiguration(configText);
            }
        });
        
        // 后处理效果事件监听器
        this.editPanel.querySelector('#enable-outline').addEventListener('change', (e) => {
            this.toggleOutline(e.target.checked);
        });
        
        this.editPanel.querySelector('#enable-fxaa').addEventListener('change', (e) => {
            this.toggleFXAA(e.target.checked);
        });
        
        // 添加到容器中
        if (this.container) {
            console.log('将编辑面板添加到容器中...');
            this.container.appendChild(this.editPanel);
        } else {
            console.log('容器不存在，将编辑面板添加到body中...');
            document.body.appendChild(this.editPanel);
        }
    }
    
    // 获取当前相机位置并填充到输入框
    getCurrentCameraPosition() {
        if (!this.camera || !this.controls || !this.editPanel) return;
        
        console.log('获取当前相机位置:', this.camera.position);
        console.log('获取当前相机目标:', this.controls.target);
        
        // 填充相机位置输入框
        this.editPanel.querySelector('#camera-pos-x').value = this.camera.position.x.toFixed(2);
        this.editPanel.querySelector('#camera-pos-y').value = this.camera.position.y.toFixed(2);
        this.editPanel.querySelector('#camera-pos-z').value = this.camera.position.z.toFixed(2);
        
        // 填充相机目标输入框
        this.editPanel.querySelector('#camera-target-x').value = this.controls.target.x.toFixed(2);
        this.editPanel.querySelector('#camera-target-y').value = this.controls.target.y.toFixed(2);
        this.editPanel.querySelector('#camera-target-z').value = this.controls.target.z.toFixed(2);
        
        // 显示提示
        this.showNotification('已获取当前相机位置和目标');
    }
    
    // 显示通知
    showNotification(message) {
        let notification = document.getElementById('glb-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'glb-notification';
            notification.style.position = 'fixed';
            notification.style.top = '50%';
            notification.style.left = '50%';
            notification.style.transform = 'translate(-50%, -50%)';
            notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            notification.style.color = 'white';
            notification.style.padding = '15px 25px';
            notification.style.borderRadius = '5px';
            notification.style.zIndex = '9999';
            notification.style.fontSize = '14px';
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        notification.style.display = 'block';
        
        // 2秒后自动隐藏
        setTimeout(() => {
            notification.style.display = 'none';
        }, 2000);
    }
    
    // 清理资源
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        // 移除编辑面板
        if (this.editPanel && this.editPanel.parentNode) {
            this.editPanel.parentNode.removeChild(this.editPanel);
        }

        // 清理事件监听器
        window.removeEventListener('resize', this.onWindowResize.bind(this));
        window.removeEventListener('keydown', this.onKeyDown.bind(this));
        window.removeEventListener('keyup', this.onKeyUp.bind(this));
        window.removeEventListener('message', this.onMessageReceived.bind(this));

        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown.bind(this));
            this.renderer.domElement.removeEventListener('mousemove', this.onMouseMove.bind(this));
            this.renderer.domElement.removeEventListener('mouseup', this.onMouseUp.bind(this));
            this.renderer.domElement.removeEventListener('click', this.onMouseClick.bind(this));
            this.renderer.domElement.removeEventListener('dblclick', this.onMouseDoubleClick.bind(this));
        }

        // 清理场景对象
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
        }

        if (this.pointerLockControls) {
            this.scene.remove(this.pointerLockControls.getObject());
        }

        // 清理渲染器
        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.composer) {
            this.composer.dispose();
        }
    }

    // 获取URL中的模型地址
    static getModelUrlFromQueryString() {
        const params = new URLSearchParams(window.location.search);
        return params.get('modelUrl');
    }

    // 获取URL中的相机位置
    static getCameraPositionFromQueryString() {
        const params = new URLSearchParams(window.location.search);
        const posX = params.get('posX');
        const posY = params.get('posY');
        const posZ = params.get('posZ');

        if (posX !== null && posY !== null && posZ !== null) {
            return { x: parseFloat(posX), y: parseFloat(posY), z: parseFloat(posZ) };
        }
        return null;
    }
}

// 全局初始化函数
function initGLBViewer() {
    // 检查Three.js是否已加载
    if (typeof THREE === 'undefined') {
        console.log('正在加载Three.js及其依赖...');
        loadThreeJsAndDependencies().then(() => {
            initializeViewer();
        }).catch(error => {
            console.error('Three.js加载失败:', error);
        });
    } else {
        initializeViewer();
    }
}

// 加载Three.js及其依赖
function loadThreeJsAndDependencies() {
    return new Promise((resolve, reject) => {
        const dependencies = [
            'https://ssm-smart.github.io/axure/three/three.min.js',
            'https://ssm-smart.github.io/axure/three/GLTFLoader.js',
            'https://ssm-smart.github.io/axure/three/OrbitControls.js',
            'https://ssm-smart.github.io/axure/three/PointerLockControls.js',
            'https://ssm-smart.github.io/axure/three/CopyShader.js',
            'https://ssm-smart.github.io/axure/three/EffectComposer.js',
            'https://ssm-smart.github.io/axure/three/RenderPass.js',
            'https://ssm-smart.github.io/axure/three/ShaderPass.js',
            'https://ssm-smart.github.io/axure/three/FXAAAShader.js',
            'https://ssm-smart.github.io/axure/three/OutlinePass.js',
            'https://ssm-smart.github.io/axure/three/tween.umd.min.js'
        ];
        
        let loadedCount = 0;
        let errorOccurred = false;
        
        dependencies.forEach(src => {
            if (errorOccurred) return;
            
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                loadedCount++;
                if (loadedCount === dependencies.length) {
                    resolve();
                }
            };
            script.onerror = (error) => {
                errorOccurred = true;
                reject(new Error(`加载脚本失败: ${src}`));
            };
            document.head.appendChild(script);
        });
    });
}

// 初始化查看器
function initializeViewer() {
    // 创建并初始化查看器，支持通过window.AxhubXrJsOptions自定义选项
    const viewerOptions = window.AxhubXrJsOptions || {};
    const viewer = new GLBViewer(viewerOptions);
    viewer.init().then(() => {
        // 尝试从URL加载模型
        const initialModelUrl = GLBViewer.getModelUrlFromQueryString();
        if (initialModelUrl) {
            viewer.loadModel(initialModelUrl);
        } else {
            // 使用默认模型进行测试
            const defaultModelUrl = 'https://ssm-smart.github.io/axure/glb/ykwd1.glb'; // 使用GitHub上的默认模型
            console.warn(`URL中未提供模型地址，正在加载默认测试模型: ${defaultModelUrl}`);
            viewer.loadModel(defaultModelUrl);
        }
    });

    // 暴露到全局
    window.GLBViewer = viewer;
    
    // 暴露可触发事件的方法供Axure元件调用
    window.toggleAutoRotate = function(enable) {
        return viewer.toggleAutoRotate(enable);
    };
    
    window.toggleShowCards = function(show) {
        return viewer.toggleCardsVisibility(show);
    };
    
    window.playAllAnimations = function() {
        if (viewer.animations && viewer.animations.length > 0) {
            viewer.playAnimation(viewer.animations[0].name);
            return true;
        }
        return false;
    };
    
    window.stopAllAnimations = function() {
        return viewer.stopAnimation();
    };
    
    window.playAnimation = function(animationName) {
        return viewer.playAnimation(animationName);
    };
    
    window.stopAnimation = function() {
        return viewer.stopAnimation();
    };
    
    window.exportConfiguration = function() {
        return viewer.exportConfiguration();
    };
    
    window.loadConfiguration = function(configStr) {
        return viewer.loadConfiguration(configStr);
    };
}

// 当文档加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGLBViewer);
} else {
    // 如果文档已经加载完成，延迟初始化以确保Three.js已加载
    setTimeout(initGLBViewer, 100);
}