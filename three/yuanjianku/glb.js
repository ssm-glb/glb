// Axhub 3D模型浏览器组件（glb.js）
// 兼容IE11+，基础JS语法，无ES6特性
// 依赖：Three.js、jQuery、Tween.js等已在页面加载

(function(){
    // 组件内部状态
    var _vars = {
        current_model: null,
        model_cards: {},
        animations: [],
        mixer: null,
        selected_object: null,
        is_walkthrough: false,
        is_top_view: false,
        last_camera_pos: null,
        last_camera_target: null,
        model_sprites: {},
        model_ground_y: 0,
        card_scale: 0.002,
        error: ''
    };
    var _config = {};
    var _dataSets = {};
    var _container = null;
    var _onEvent = function(){};

    // 事件/动作/变量/配置/数据列表
    var eventList = [
        { name: 'onModelLoaded', desc: '模型加载完成' },
        { name: 'onModelSelected', desc: '模型部件被选中' },
        { name: 'onError', desc: '发生错误' },
        { name: 'onCameraUpdate', desc: '相机位置更新' }
    ];
    var actionList = [
        { name: 'loadModel', desc: '加载模型' },
        { name: 'playAnimation', desc: '播放动画' },
        { name: 'stopAnimation', desc: '停止动画' },
        { name: 'toggleWalkthrough', desc: '切换漫游模式' },
        { name: 'toggle2D3D', desc: '切换2D/3D视角' }
    ];
    var varList = [
        { name: 'current_model', desc: '当前模型对象' },
        { name: 'selected_object', desc: '当前选中对象' },
        { name: 'is_walkthrough', desc: '是否漫游模式' },
        { name: 'is_top_view', desc: '是否2D俯视' },
        { name: 'error', desc: '错误信息' }
    ];
    var configList = [
        { name: 'modelUrl', desc: '模型URL' },
        { name: 'ambientLightIntensity', desc: '环境光强度' },
        { name: 'sunLightIntensity', desc: '太阳光强度' },
        { name: 'directionalLightIntensity', desc: '平行光强度' },
        { name: 'directionalLightAngle', desc: '平行光角度' },
        { name: 'cardScale', desc: '顶牌缩放比例' }
    ];
    var dataList = [
        { name: 'modelList', desc: '模型部件列表', keys: [ { name: 'name', desc: '部件名称' } ] },
        { name: 'animationList', desc: '动画列表', keys: [ { name: 'name', desc: '动画名称' } ] },
        { name: 'modelCards', desc: '顶牌数据', keys: [ { name: 'modelName', desc: '部件名称' }, { name: 'cardText', desc: '顶牌内容' } ] }
    ];

    // 变量获取
    function getVar(name) {
        return _vars[name];
    }
    // 动作触发
    function fireAction(name, payload) {
        if(name === 'loadModel') {
            _loadModel(payload && payload.url ? payload.url : (_config.modelUrl || ''));
        } else if(name === 'playAnimation') {
            _playAnimation(payload && payload.name);
        } else if(name === 'stopAnimation') {
            _stopAnimation(payload && payload.name);
        } else if(name === 'toggleWalkthrough') {
            _toggleWalkthrough();
        } else if(name === 'toggle2D3D') {
            _toggle2D3D();
        }
    }

    // 主渲染函数
    function render(container, dataSets, config, onEvent) {
        _container = container;
        _dataSets = dataSets || {};
        _config = config || {};
        _onEvent = typeof onEvent === 'function' ? onEvent : function(){};

        // 清空容器
        while(_container.firstChild) _container.removeChild(_container.firstChild);

        // 1. 创建基础UI结构
        _createBaseUI();

        // 2. 初始化Three.js场景
        _initThreeScene();

        // 3. 加载模型（如有）
        var modelUrl = _config.modelUrl || '';
        if(modelUrl) {
            _loadModel(modelUrl);
        }

        return {
            getVar: getVar,
            fireAction: fireAction,
            eventList: eventList,
            actionList: actionList,
            varList: varList,
            configList: configList,
            dataList: dataList
        };
    }

    // 创建基础UI结构（进度条、错误提示、按钮区等）
    function _createBaseUI() {
        // 进度条
        var loadingBarContainer = document.createElement('div');
        loadingBarContainer.id = 'axglb-loading-bar-container';
        loadingBarContainer.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:260px;height:18px;background:#f3f3f3;border:1px solid #ccc;border-radius:5px;overflow:hidden;display:none;z-index:10;';
        var loadingBar = document.createElement('div');
        loadingBar.id = 'axglb-loading-bar';
        loadingBar.style.cssText = 'height:100%;width:0%;background:#4CAF50;text-align:center;line-height:18px;color:white;border-radius:3px;transition:width 0.2s;';
        loadingBarContainer.appendChild(loadingBar);
        var loadingText = document.createElement('div');
        loadingText.id = 'axglb-loading-text';
        loadingText.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;text-align:center;line-height:18px;color:#333;font-size:12px;pointer-events:none;';
        loadingBarContainer.appendChild(loadingText);
        _container.appendChild(loadingBarContainer);

        // 错误提示
        var errorDiv = document.createElement('div');
        errorDiv.id = 'axglb-error-message';
        errorDiv.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:red;font-size:15px;display:none;z-index:11;background:#fff;padding:10px 18px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.08);';
        _container.appendChild(errorDiv);

        // 按钮区
        var btnWrapper = document.createElement('div');
        btnWrapper.id = 'axglb-btn-wrapper';
        btnWrapper.style.cssText = 'position:absolute;top:10px;right:10px;z-index:12;display:flex;gap:10px;';
        _container.appendChild(btnWrapper);

        // 按钮：截图
        var btnShot = document.createElement('button');
        btnShot.innerHTML = '截图';
        btnShot.style.cssText = _btnStyle();
        btnShot.onclick = function(){ _takeScreenshot(); };
        btnWrapper.appendChild(btnShot);
        // 按钮：复制相机位置
        var btnCopyCam = document.createElement('button');
        btnCopyCam.innerHTML = '复制相机位置';
        btnCopyCam.style.cssText = _btnStyle();
        btnCopyCam.onclick = function(){ _copyCameraPosition(); };
        btnWrapper.appendChild(btnCopyCam);
        // 按钮：2D/3D切换
        var btn23D = document.createElement('button');
        btn23D.innerHTML = '2D';
        btn23D.style.cssText = _btnStyle();
        btn23D.onclick = function(){ _toggle2D3D(btn23D); };
        btnWrapper.appendChild(btn23D);
        // 按钮：复制模型列表
        var btnCopyModel = document.createElement('button');
        btnCopyModel.innerHTML = '复制模型列表';
        btnCopyModel.style.cssText = _btnStyle();
        btnCopyModel.onclick = function(){ _copyModelList(); };
        btnWrapper.appendChild(btnCopyModel);
        // 按钮：复制动画名称
        var btnCopyAnim = document.createElement('button');
        btnCopyAnim.innerHTML = '复制动画名称';
        btnCopyAnim.style.cssText = _btnStyle();
        btnCopyAnim.onclick = function(){ _copyAnimationList(); };
        btnWrapper.appendChild(btnCopyAnim);

        // 按钮：漫游模式
        var btnWalk = document.createElement('button');
        btnWalk.innerHTML = '漫游模式';
        btnWalk.style.cssText = _btnStyle();
        btnWalk.onclick = function(){ _toggleWalkthrough(btnWalk); };
        btnWrapper.appendChild(btnWalk);

        // 动画控制区
        var animWrap = document.createElement('div');
        animWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
        var animSel = document.createElement('select');
        animSel.style.cssText = 'height:28px;font-size:14px;border-radius:4px;';
        animSel.id = 'axglb-anim-sel';
        animWrap.appendChild(animSel);
        var btnPlayAnim = document.createElement('button');
        btnPlayAnim.innerHTML = '播放动画';
        btnPlayAnim.style.cssText = _btnStyle();
        btnPlayAnim.onclick = function(){ _playSelectedAnimation(); };
        animWrap.appendChild(btnPlayAnim);
        var btnStopAnim = document.createElement('button');
        btnStopAnim.innerHTML = '停止动画';
        btnStopAnim.style.cssText = _btnStyle();
        btnStopAnim.onclick = function(){ _stopSelectedAnimation(); };
        animWrap.appendChild(btnStopAnim);
        btnWrapper.appendChild(animWrap);
    }
    // 按钮通用样式
    function _btnStyle() {
        return 'padding:7px 14px;font-size:14px;cursor:pointer;background:#222;color:#fff;border:none;border-radius:4px;transition:background 0.2s;';
    }
    // 截图
    function _takeScreenshot() {
        if(_renderer) {
            _renderer.render(_scene, _camera);
            var canvas = _renderer.domElement;
            try {
                var dataURL = canvas.toDataURL('image/png');
                var link = document.createElement('a');
                link.href = dataURL;
                link.download = '3d_screenshot.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                if(_onEvent) _onEvent('onScreenshot', {});
            } catch(e) {
                _showError('截图失败');
            }
        }
    }
    // 复制相机位置
    function _copyCameraPosition() {
        if(_camera) {
            var pos = _camera.position;
            var str = pos.x+'\n'+pos.y+'\n'+pos.z;
            _copyToClipboard(str, '相机位置已复制!');
            if(_onEvent) _onEvent('onCameraUpdate', { position: {x:pos.x, y:pos.y, z:pos.z} });
        }
    }
    // 2D/3D切换
    var _isTopView = false, _lastCamPos = null, _lastCamTarget = null;
    function _toggle2D3D(btn) {
        if(!_controls||!_camera) return;
        if(!_isTopView) {
            _lastCamPos = _camera.position.clone();
            _lastCamTarget = _controls.target.clone();
            var target = _controls.target.clone();
            var dist = _camera.position.distanceTo(target);
            var newPos = new THREE.Vector3(target.x, target.y+dist, target.z);
            if(window.TWEEN) {
                new window.TWEEN.Tween(_camera.position).to({x:newPos.x,y:newPos.y,z:newPos.z},600).easing(window.TWEEN.Easing.Quadratic.Out).onUpdate(function(){_controls.update();}).start();
                new window.TWEEN.Tween(_controls.target).to({x:target.x,y:target.y,z:target.z},600).easing(window.TWEEN.Easing.Quadratic.Out).onUpdate(function(){_controls.update();}).start();
            } else {
                _camera.position.copy(newPos);
                _controls.target.copy(target);
                _controls.update();
            }
            if(btn) btn.innerHTML = '3D';
            _isTopView = true;
        } else {
            if(_lastCamPos && _lastCamTarget) {
                if(window.TWEEN) {
                    new window.TWEEN.Tween(_camera.position).to({x:_lastCamPos.x,y:_lastCamPos.y,z:_lastCamPos.z},600).easing(window.TWEEN.Easing.Quadratic.Out).onUpdate(function(){_controls.update();}).start();
                    new window.TWEEN.Tween(_controls.target).to({x:_lastCamTarget.x,y:_lastCamTarget.y,z:_lastCamTarget.z},600).easing(window.TWEEN.Easing.Quadratic.Out).onUpdate(function(){_controls.update();}).start();
                } else {
                    _camera.position.copy(_lastCamPos);
                    _controls.target.copy(_lastCamTarget);
                    _controls.update();
                }
            }
            if(btn) btn.innerHTML = '2D';
            _isTopView = false;
        }
        if(_onEvent) _onEvent('onToggle2D3D', { isTopView: _isTopView });
    }
    // 复制模型列表
    function _copyModelList() {
        if(!_vars.current_model) { _showError('没有加载模型'); return; }
        var names = [];
        _vars.current_model.traverse(function(obj){
            if(obj.name) names.push(obj.name);
        });
        if(names.length===0) { _showError('模型中没有命名对象'); return; }
        _copyToClipboard(names.join('\n'), '模型列表已复制!');
    }
    // 复制动画名称
    function _copyAnimationList() {
        var anims = _vars.animations||[];
        var names = [];
        for(var i=0;i<anims.length;i++) {
            if(anims[i].name) names.push(anims[i].name);
        }
        if(names.length===0) { _showError('没有动画可复制'); return; }
        _copyToClipboard(names.join('\n'), '动画名称已复制!');
    }
    // 复制到剪贴板
    function _copyToClipboard(text, msg) {
        var ok = false;
        if(window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
            window.navigator.clipboard.writeText(text); ok=true;
        } else {
            var textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.top = '0';
            textarea.style.left = '0';
            document.body.appendChild(textarea);
            textarea.focus(); textarea.select();
            try { ok = document.execCommand('copy'); } catch(e) { ok=false; }
            document.body.removeChild(textarea);
        }
        if(msg) {
            _showError(msg);
            setTimeout(_hideError, 1200);
        }
    }

    // Three.js场景初始化
    var _scene, _camera, _renderer, _controls, _ambientLight, _directionalLight, _sunLight;
    function _initThreeScene() {
        if(typeof THREE==='undefined'||!THREE.Scene) {
            _showError('3D渲染库加载失败');
            return;
        }
        _scene = new THREE.Scene();
        var width = _container.clientWidth || 600;
        var height = _container.clientHeight || 400;
        _camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 1000);
        _camera.position.set(2,2,2);
        _renderer = new THREE.WebGLRenderer({antialias:true});
        _renderer.setSize(width, height);
        _renderer.setClearColor(0x000000, 1);
        _renderer.domElement.style.display = 'block';
        _renderer.domElement.style.width = '100%';
        _renderer.domElement.style.height = '100%';
        _container.appendChild(_renderer.domElement);
        // 灯光
        var amb = Number(_config.ambientLightIntensity)||1;
        var sun = Number(_config.sunLightIntensity)||0;
        var dir = Number(_config.directionalLightIntensity)||1;
        var ang = Number(_config.directionalLightAngle)||180;
        _ambientLight = new THREE.AmbientLight(0xfffbe6, amb);
        _scene.add(_ambientLight);
        _directionalLight = new THREE.DirectionalLight(0xffffff, dir);
        _directionalLight.position.set(1,1,1).normalize();
        _scene.add(_directionalLight);
        _sunLight = new THREE.DirectionalLight(0xfff2cc, sun);
        _sunLight.position.set(10,20,10);
        _scene.add(_sunLight);
        // 控制器
        if(THREE.OrbitControls) {
            _controls = new THREE.OrbitControls(_camera, _renderer.domElement);
            _controls.enableDamping = true;
            _controls.dampingFactor = 0.05;
        }
        // 自适应
        window.addEventListener('resize', function(){
            var w = _container.clientWidth||600;
            var h = _container.clientHeight||400;
            _camera.aspect = w/h;
            _camera.updateProjectionMatrix();
            _renderer.setSize(w,h);
        });
        // 鼠标点击事件（用于顶牌点击高亮）
        _renderer.domElement.addEventListener('click', function(e){
            _onSpriteClick(e);
        });
        // 动画循环
        function animate(){
            if(_controls) _controls.update();
            if(_vars.mixer) _vars.mixer.update(0.016);
            // 让所有顶牌Sprite始终面向相机
            _updateSpritesBillboard();
            _renderer.render(_scene, _camera);
            if(window.TWEEN) window.TWEEN.update();
            if(_vars._animReq) window.cancelAnimationFrame(_vars._animReq);
            _vars._animReq = window.requestAnimationFrame(animate);
        }
        animate();
    }

    // 让所有Sprite顶牌始终面向相机
    function _updateSpritesBillboard() {
        if(!_vars.model_sprites) return;
        for(var k in _vars.model_sprites) {
            var sprite = _vars.model_sprites[k];
            if(sprite && _camera) {
                sprite.quaternion.copy(_camera.quaternion);
            }
        }
    }

    // 鼠标点击Sprite顶牌高亮部件
    function _onSpriteClick(e) {
        if(!_vars.model_sprites || !_vars.current_model) return;
        var rect = _renderer.domElement.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        var mouse = new THREE.Vector2(x, y);
        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, _camera);
        // 检查是否点中了Sprite
        var sprites = [];
        for(var k in _vars.model_sprites) {
            if(_vars.model_sprites[k]) sprites.push(_vars.model_sprites[k]);
        }
        var intersects = raycaster.intersectObjects(sprites, true);
        if(intersects.length>0) {
            // 找到对应部件名
            var sprite = intersects[0].object;
            var partName = null;
            for(var n in _vars.model_sprites) {
                if(_vars.model_sprites[n]===sprite) { partName = n; break; }
            }
            if(partName) {
                _highlightModelPart(partName);
                if(_onEvent) _onEvent('onModelSelected', { modelName: partName });
            }
        }
    }
    // 高亮部件（简单变色/发光，可后续扩展）
    var _lastHighlight = null;
    function _highlightModelPart(name) {
        if(_lastHighlight && _lastHighlight.material && _lastHighlight._origColor) {
            if(_lastHighlight.material.color) _lastHighlight.material.color.set(_lastHighlight._origColor);
        }
        var found = null;
        _vars.current_model.traverse(function(obj){
            if(obj.name===name && obj.material && obj.material.color) {
                found = obj;
            }
        });
        if(found) {
            found._origColor = found.material.color.getHex();
            found.material.color.set(0xffc107); // 高亮色
            _lastHighlight = found;
        }
    }

    // 显示/隐藏错误
    function _showError(msg) {
        var err = _container.querySelector('#axglb-error-message');
        if(err) { err.innerHTML = msg; err.style.display = 'block'; }
        _vars.error = msg;
        if(_onEvent) _onEvent('onError', { message: msg });
    }
    function _hideError() {
        var err = _container.querySelector('#axglb-error-message');
        if(err) err.style.display = 'none';
        _vars.error = '';
    }
    // 加载进度
    function _showLoading(pct) {
        var bar = _container.querySelector('#axglb-loading-bar');
        var box = _container.querySelector('#axglb-loading-bar-container');
        var txt = _container.querySelector('#axglb-loading-text');
        if(bar&&box) {
            bar.style.width = (pct||0)+'%';
            box.style.display = 'block';
            if(txt) txt.innerHTML = (pct||0)+'%';
        }
    }
    function _hideLoading() {
        var box = _container.querySelector('#axglb-loading-bar-container');
        if(box) box.style.display = 'none';
    }
    // 加载模型主流程（GLB/GLTF）
    function _loadModel(url) {
        if(!url) { _showError('请提供模型URL'); return; }
        _hideError();
        _showLoading(0);
        // 卸载旧模型和顶牌
        if(_vars.current_model) {
            _scene.remove(_vars.current_model);
            _vars.current_model = null;
        }
        _clearModelSprites();
        // GLTFLoader
        if(!THREE.GLTFLoader) { _showError('GLTFLoader未加载'); _hideLoading(); return; }
        var loader = new THREE.GLTFLoader();
        if(THREE.DRACOLoader) {
            var dracoLoader = new THREE.DRACOLoader();
            dracoLoader.setDecoderPath('https://ssm-smart.github.io/axure/three/');
            loader.setDRACOLoader(dracoLoader);
        }
        loader.load(url, function(gltf){
            _vars.current_model = gltf.scene;
            _scene.add(_vars.current_model);
            _vars.animations = gltf.animations||[];
            if(_vars.animations.length>0 && THREE.AnimationMixer) {
                _vars.mixer = new THREE.AnimationMixer(_vars.current_model);
            }
            _hideLoading();
            _updateModelSprites(); // 加载后渲染顶牌
            if(_onEvent) _onEvent('onModelLoaded', { model: _vars.current_model });
        }, function(xhr){
            if(xhr.lengthComputable) {
                var pct = xhr.loaded/xhr.total*100;
                _showLoading(pct);
            }
        }, function(err){
            _showError('模型加载失败: '+(err&&err.message?err.message:'未知错误'));
            _hideLoading();
        });
    }

    // 顶牌相关
    function _updateModelSprites() {
        _clearModelSprites();
        var cards = _dataSets.modelCards || [];
        var cardMap = {};
        for(var i=0;i<cards.length;i++) {
            var n = cards[i].modelName;
            if(n) cardMap[n] = cards[i].cardText||'';
        }
        _vars.model_cards = cardMap;
        if(!_vars.current_model) return;
        _vars.model_sprites = {};
        _vars.card_scale = Number(_config.cardScale)||0.002;
        _vars.model_ground_y = 0;
        // 计算模型地面高度
        var box = new THREE.Box3().setFromObject(_vars.current_model);
        _vars.model_ground_y = box.min.y;
        // 遍历模型，查找有顶牌的部件
        _vars.current_model.traverse(function(obj){
            if(obj.name && cardMap[obj.name]) {
                var cardText = cardMap[obj.name];
                var texInfo = _createCardTexture(cardText);
                var material = new THREE.SpriteMaterial({ map: texInfo.texture, transparent: true, opacity: 0.95 });
                var sprite = new THREE.Sprite(material);
                sprite.scale.set(texInfo.width*_vars.card_scale, texInfo.height*_vars.card_scale, 1);
                // 定位到部件中心上方
                var obox = new THREE.Box3().setFromObject(obj);
                var center = obox.getCenter(new THREE.Vector3());
                var size = obox.getSize(new THREE.Vector3());
                sprite.position.copy(center);
                sprite.position.y += size.y * 1.0;
                _scene.add(sprite);
                _vars.model_sprites[obj.name] = sprite;
            }
        });
    }
    function _clearModelSprites() {
        if(_vars.model_sprites) {
            for(var k in _vars.model_sprites) {
                if(_vars.model_sprites[k]) {
                    _scene.remove(_vars.model_sprites[k]);
                    if(_vars.model_sprites[k].material && _vars.model_sprites[k].material.map) {
                        _vars.model_sprites[k].material.map.dispose();
                    }
                    if(_vars.model_sprites[k].material) _vars.model_sprites[k].material.dispose();
                }
            }
        }
        _vars.model_sprites = {};
    }
    // canvas生成卡片纹理
    function _createCardTexture(cardText) {
        var lines = String(cardText||'').replace(/<br\s*\/?\>/ig,'\n').split(/\n/);
        if(lines.length===0) lines=[cardText];
        var tempCanvas = document.createElement('canvas');
        var tempCtx = tempCanvas.getContext('2d');
        var maxWidth = 0;
        var lineHeight = 24;
        for(var i=0;i<lines.length;i++) {
            tempCtx.font = i===0 ? 'bold 16px Arial' : '14px Arial';
            var w = tempCtx.measureText(lines[i]).width;
            if(w>maxWidth) maxWidth = w;
        }
        var paddingX = 18, paddingY = 12;
        var canvasWidth = Math.ceil(maxWidth + paddingX*2);
        var canvasHeight = lineHeight*lines.length + paddingY*2;
        var canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        var ctx = canvas.getContext('2d');
        // 背景渐变
        var gradient = ctx.createLinearGradient(0,0,0,canvas.height);
        gradient.addColorStop(0,'rgba(20,30,48,0.95)');
        gradient.addColorStop(1,'rgba(36,59,85,0.95)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle = 'rgba(0,195,255,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1,1,canvas.width-2,canvas.height-2);
        var y = paddingY + lineHeight;
        for(var i=0;i<lines.length;i++) {
            ctx.font = i===0 ? 'bold 16px Arial' : '14px Arial';
            ctx.fillStyle = i===0 ? '#00c3ff' : '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(lines[i], canvas.width/2, y);
            y += lineHeight;
        }
        var texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return { texture: texture, width: canvas.width, height: canvas.height };
    }

    // ========== 漫游模式（WASD第一人称） ==========
    var _pointerLockControls = null, _isWalkMode = false;
    function _toggleWalkthrough(btn) {
        if(!_renderer||!_camera) return;
        if(!_pointerLockControls && THREE.PointerLockControls) {
            _pointerLockControls = new THREE.PointerLockControls(_camera, _renderer.domElement);
        }
        if(!_pointerLockControls) { _showError('PointerLockControls未加载'); return; }
        if(!_isWalkMode) {
            // 进入漫游
            if(_controls) _controls.enabled = false;
            _pointerLockControls.enabled = true;
            _scene.add(_pointerLockControls.getObject());
            _renderer.domElement.requestPointerLock = _renderer.domElement.requestPointerLock || _renderer.domElement.mozRequestPointerLock;
            if(_renderer.domElement.requestPointerLock) _renderer.domElement.requestPointerLock();
            document.addEventListener('pointerlockchange', _onPointerLockChange, false);
            document.addEventListener('keydown', _onWalkKeyDown, false);
            document.addEventListener('keyup', _onWalkKeyUp, false);
            if(btn) btn.innerHTML = '退出漫游';
            _isWalkMode = true;
        } else {
            // 退出漫游
            if(_pointerLockControls) {
                _pointerLockControls.enabled = false;
                _scene.remove(_pointerLockControls.getObject());
            }
            if(_controls) _controls.enabled = true;
            document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;
            if(document.exitPointerLock) document.exitPointerLock();
            document.removeEventListener('pointerlockchange', _onPointerLockChange, false);
            document.removeEventListener('keydown', _onWalkKeyDown, false);
            document.removeEventListener('keyup', _onWalkKeyUp, false);
            if(btn) btn.innerHTML = '漫游模式';
            _isWalkMode = false;
        }
    }
    function _onPointerLockChange() {
        if(document.pointerLockElement!==_renderer.domElement) {
            _toggleWalkthrough();
        }
    }
    // WASD移动
    var _walkMove = {forward:false,back:false,left:false,right:false}, _walkSpeed=0.08;
    function _onWalkKeyDown(e) {
        var c = e.code||e.key;
        if(c==='KeyW'||c==='ArrowUp') _walkMove.forward=true;
        if(c==='KeyS'||c==='ArrowDown') _walkMove.back=true;
        if(c==='KeyA'||c==='ArrowLeft') _walkMove.left=true;
        if(c==='KeyD'||c==='ArrowRight') _walkMove.right=true;
    }
    function _onWalkKeyUp(e) {
        var c = e.code||e.key;
        if(c==='KeyW'||c==='ArrowUp') _walkMove.forward=false;
        if(c==='KeyS'||c==='ArrowDown') _walkMove.back=false;
        if(c==='KeyA'||c==='ArrowLeft') _walkMove.left=false;
        if(c==='KeyD'||c==='ArrowRight') _walkMove.right=false;
    }
    // 在动画循环中补充漫游移动
    var _oldAnimate = null;
    (function(){
        var _old = _initThreeScene;
        _initThreeScene = function(){
            _old.apply(this, arguments);
            _oldAnimate = _vars._animReq;
            // 重写动画循环，插入漫游移动
            function animate(){
                if(_controls) _controls.update();
                if(_vars.mixer) _vars.mixer.update(0.016);
                _updateSpritesBillboard();
                if(_isWalkMode && _pointerLockControls && _pointerLockControls.enabled) {
                    var v = new THREE.Vector3();
                    if(_walkMove.forward) v.z -= _walkSpeed;
                    if(_walkMove.back) v.z += _walkSpeed;
                    if(_walkMove.left) v.x -= _walkSpeed;
                    if(_walkMove.right) v.x += _walkSpeed;
                    _pointerLockControls.moveRight(v.x);
                    _pointerLockControls.moveForward(v.z);
                }
                _renderer.render(_scene, _camera);
                if(window.TWEEN) window.TWEEN.update();
                if(_vars._animReq) window.cancelAnimationFrame(_vars._animReq);
                _vars._animReq = window.requestAnimationFrame(animate);
            }
            animate();
        };
    })();

    // ========== 动画播放控制 ==========
    function _playSelectedAnimation() {
        var sel = document.getElementById('axglb-anim-sel');
        if(!sel||!_vars.mixer||!_vars.animations) return;
        var name = sel.value;
        _playAnimation(name);
    }
    function _stopSelectedAnimation() {
        if(_vars.mixer) _vars.mixer.stopAllAction();
    }
    function _playAnimation(name) {
        if(!_vars.mixer||!_vars.animations) return;
        var clip = null;
        for(var i=0;i<_vars.animations.length;i++) {
            if(_vars.animations[i].name===name) { clip=_vars.animations[i]; break; }
        }
        if(clip) {
            _vars.mixer.stopAllAction();
            var action = _vars.mixer.clipAction(clip);
            action.reset();
            action.play();
        }
    }
    function _stopAnimation(name) {
        if(!_vars.mixer||!_vars.animations) return;
        for(var i=0;i<_vars.animations.length;i++) {
            if(_vars.animations[i].name===name) {
                var action = _vars.mixer.clipAction(_vars.animations[i]);
                action.stop();
            }
        }
    }
    // 加载模型后刷新动画下拉
    var _oldLoadModel = _loadModel;
    _loadModel = function(url) {
        _oldLoadModel.apply(this, arguments);
        setTimeout(_refreshAnimSelect, 800);
    };
    function _refreshAnimSelect() {
        var sel = document.getElementById('axglb-anim-sel');
        if(!sel) return;
        sel.innerHTML = '';
        var anims = _vars.animations||[];
        for(var i=0;i<anims.length;i++) {
            var opt = document.createElement('option');
            opt.value = anims[i].name;
            opt.innerHTML = anims[i].name;
            sel.appendChild(opt);
        }
    }

    // ========== 全局挂载放在最后 ==========
    if (typeof window !== 'undefined') {
      window.AxhubGLBViewer = {
        render: render
      };
    }
})();
