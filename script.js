/**
 * SVG Partycle Generator - Version 2.0
 * A modern web tool for transforming SVGs into interactive particle animations
 * Optimized with:
 * - Multi-layer support
 * - High performance instanced rendering
 * - Memory-efficient resource management
 * - Improved SVG processing and color preservation
 * 
 * Created by Enrico Deiana - https://www.enricodeiana.design/
 * Enhanced version 2025
 */

// Application namespace to avoid global variable pollution
const ParticleApp = (function() {
  // Private variables and state
  const state = {
    activeLayerId: null,
    layers: [],
    nextLayerId: 1,
    isProcessing: false,
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    composer: null,
    bloomPass: null,
    simplex: null,
    mousePosition: new THREE.Vector3(),
    mouseMoved: false,
    lastFrameTime: 0,
    frameCounter: 0,
    fps: 0,
    fpsUpdateTime: 0,
    particleCount: 0,
    userPresets: {}
  };

  // Fixed references to DOM elements
  const dom = {
    sceneContainer: document.getElementById('scene-container'),
    svgInput: document.getElementById('svg-input'),
    svgFileName: document.getElementById('svg-file-name'),
    generateBtn: document.getElementById('generate-btn'),
    resetBtn: document.getElementById('reset-btn'),
    resetCameraBtn: document.getElementById('reset-camera-btn'),
    exportCodeBtn: document.getElementById('export-code-btn'),
    exportGifBtn: document.getElementById('export-gif-btn'),
    copyCodeBtn: document.getElementById('copy-code-btn'),
    codeModal: document.getElementById('code-modal'),
    presetModal: document.getElementById('preset-modal'),
    closeModalBtn: document.querySelector('.close-modal'),
    closePresetModalBtn: document.querySelector('.close-preset-modal'),
    codeEl: document.getElementById('generated-code'),
    notification: document.getElementById('notification'),
    loadingEl: document.getElementById('loading'),
    useGradientCheckbox: document.getElementById('use-gradient'),
    preserveColorsCheckbox: document.getElementById('preserve-colors'),
    useInstancedRenderingCheckbox: document.getElementById('use-instanced-rendering'),
    solidColorControl: document.getElementById('solid-color-control'),
    gradientControls: document.getElementById('gradient-controls'),
    dropArea: document.getElementById('drop-area'),
    sandEffectCheckbox: document.getElementById('sand-effect'),
    enableOrbitCheckbox: document.getElementById('enable-orbit'),
    addSvgBtn: document.getElementById('add-svg-btn'),
    layersList: document.getElementById('layers-list'),
    emptyLayersMessage: document.querySelector('.empty-layers-message'),
    layerTemplate: document.getElementById('layer-template'),
    presetSelector: document.getElementById('preset-selector'),
    savePresetBtn: document.getElementById('save-preset-btn'),
    deletePresetBtn: document.getElementById('delete-preset-btn'),
    confirmSavePresetBtn: document.getElementById('confirm-save-preset-btn'),
    cancelPresetBtn: document.getElementById('cancel-preset-btn'),
    presetNameInput: document.getElementById('preset-name'),
    presetDescriptionInput: document.getElementById('preset-description'),
    fpsCounter: document.getElementById('fps-counter'),
    particleCounter: document.getElementById('particle-counter'),
    screenshotBtn: document.getElementById('screenshot-btn')
  };

  // Reusable geometries and materials cache
  const resourceCache = {
    particleGeometry: null,
    materialCache: new Map(), // Cache materials by color hex
    disposables: [] // Track resources that need disposal
  };

  /**
   * Initialize the application
   */
  function init() {
    // Setup Three.js scene
    setupScene();
    
    // Setup drag and drop functionality
    setupDragAndDrop();
    
    // Event listeners for controls
    setupEventListeners();
    
    // Load user presets from localStorage
    loadUserPresets();
    
    // Start animation loop
    requestAnimationFrame(animate);
    
    // Initialize SimplexNoise
    state.simplex = new SimplexNoise();
  }

  /**
   * Setup Three.js scene, renderer, and camera
   */
  function setupScene() {
    // Create scene
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color('#0f172a');
    
    // Create camera
    state.camera = new THREE.PerspectiveCamera(
      60, 
      getAspectRatio(), 
      0.1, 
      1000
    );
    state.camera.position.z = 200;
    
    // Create renderer with antialiasing for better quality
    state.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'highp'
    });
    state.renderer.setPixelRatio(window.devicePixelRatio);
    state.renderer.setSize(
      dom.sceneContainer.clientWidth,
      dom.sceneContainer.clientHeight
    );
    dom.sceneContainer.appendChild(state.renderer.domElement);
    
    // Setup post-processing for bloom effect
    setupPostProcessing();
    
    // Add OrbitControls
    state.controls = new THREE.OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.1;
    state.controls.screenSpacePanning = true;
    state.controls.minDistance = 50;
    state.controls.maxDistance = 500;
    updateOrbitControls();
    
    // Create reusable particle geometry (sphere for 3D look)
    resourceCache.particleGeometry = new THREE.SphereGeometry(1, 16, 16);
    resourceCache.disposables.push(resourceCache.particleGeometry);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
  }

  /**
   * Setup post-processing pipeline for visual effects
   */
  function setupPostProcessing() {
    // Create EffectComposer
    state.composer = new THREE.EffectComposer(state.renderer);
    
    // Add render pass
    const renderPass = new THREE.RenderPass(state.scene, state.camera);
    state.composer.addPass(renderPass);
    
    // Add bloom pass
    state.bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(dom.sceneContainer.clientWidth, dom.sceneContainer.clientHeight),
      0.9, // Strength
      0.4, // Radius
      0.85 // Threshold
    );
    state.composer.addPass(state.bloomPass);
    
    // Update bloom settings based on UI
    updateBloomSettings();
  }

  /**
   * Update bloom effect settings from UI controls
   */
  function updateBloomSettings() {
    if (!state.bloomPass) return;
    
    const glowEffectEnabled = document.getElementById('glow-effect').checked;
    const bloomStrength = parseFloat(document.getElementById('bloom-strength').value) || 0.9;
    const bloomRadius = parseFloat(document.getElementById('bloom-radius').value) || 0.4;
    const bloomThreshold = parseFloat(document.getElementById('bloom-threshold').value) || 0.85;
    
    // Apply settings
    state.bloomPass.enabled = glowEffectEnabled;
    state.bloomPass.strength = bloomStrength;
    state.bloomPass.radius = bloomRadius;
    state.bloomPass.threshold = bloomThreshold;
  }

  /**
   * Setup drag and drop functionality for SVG files
   */
  function setupDragAndDrop() {
    // Prevent default behaviors for drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dom.sceneContainer.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      dom.sceneContainer.addEventListener(eventName, () => {
        dom.sceneContainer.classList.add('drag-over');
      }, false);
    });
    
    // Remove highlight when item is dragged out or dropped
    ['dragleave', 'drop'].forEach(eventName => {
      dom.sceneContainer.addEventListener(eventName, () => {
        dom.sceneContainer.classList.remove('drag-over');
      }, false);
    });
    
    // Handle dropped files
    dom.sceneContainer.addEventListener('drop', handleDrop, false);
    
    // Make the entire drop area clickable to trigger file input
    if (dom.dropArea) {
      dom.dropArea.addEventListener('click', () => {
        dom.svgInput.click();
      });
    }
  }

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * Handle dropped SVG files
   */
  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length) {
      // Check if file is SVG
      const file = files[0];
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        dom.svgFileName.textContent = file.name;
        readSVGFile(file);
      } else {
        showNotification('Please upload an SVG file.', 'warning');
      }
    }
  }

  /**
   * Setup all event listeners for application controls
   */
  function setupEventListeners() {
    // Tab navigation
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        
        // Update active tab button
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Update active tab content
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabId}-tab`).classList.add('active');
      });
    });
    
    // File input
    if (dom.svgInput) {
      dom.svgInput.addEventListener('change', () => {
        if (dom.svgInput.files.length > 0) {
          dom.svgFileName.textContent = dom.svgInput.files[0].name;
          readSVGFile(dom.svgInput.files[0]);
        } else {
          dom.svgFileName.textContent = 'No file selected';
        }
      });
    }
    
    // Add SVG layer button
    if (dom.addSvgBtn) {
      dom.addSvgBtn.addEventListener('click', () => {
        dom.svgInput.click();
      });
    }
    
    // Buttons
    if (dom.generateBtn) dom.generateBtn.addEventListener('click', generateAllLayers);
    if (dom.resetBtn) dom.resetBtn.addEventListener('click', resetSettings);
    if (dom.resetCameraBtn) dom.resetCameraBtn.addEventListener('click', resetCamera);
    
    // Sand effect mode toggle
    if (dom.sandEffectCheckbox) {
      dom.sandEffectCheckbox.addEventListener('change', function() {
        updateAllLayers();
      });
    }
    
    // Orbit controls toggle
    if (dom.enableOrbitCheckbox) {
      dom.enableOrbitCheckbox.addEventListener('change', updateOrbitControls);
    }
    
    // Code export modal
    if (dom.exportCodeBtn) {
      dom.exportCodeBtn.addEventListener('click', () => {
        generateCode();
        dom.codeModal.classList.add('active');
      });
    }
    
    if (dom.closeModalBtn) {
      dom.closeModalBtn.addEventListener('click', () => {
        dom.codeModal.classList.remove('active');
      });
    }
    
    if (dom.copyCodeBtn) {
      dom.copyCodeBtn.addEventListener('click', copyCode);
    }
    
    // GIF export
    if (dom.exportGifBtn) {
      dom.exportGifBtn.addEventListener('click', exportGif);
    }
    
    // Preset system
    if (dom.presetSelector) {
      dom.presetSelector.addEventListener('change', applySelectedPreset);
    }
    
    if (dom.savePresetBtn) {
      dom.savePresetBtn.addEventListener('click', () => {
        dom.presetModal.classList.add('active');
      });
    }
    
    if (dom.deletePresetBtn) {
      dom.deletePresetBtn.addEventListener('click', deleteSelectedPreset);
    }
    
    if (dom.confirmSavePresetBtn) {
      dom.confirmSavePresetBtn.addEventListener('click', saveCurrentPreset);
    }
    
    if (dom.cancelPresetBtn) {
      dom.cancelPresetBtn.addEventListener('click', () => {
        dom.presetModal.classList.remove('active');
      });
    }
    
    if (dom.closePresetModalBtn) {
      dom.closePresetModalBtn.addEventListener('click', () => {
        dom.presetModal.classList.remove('active');
      });
    }
    
    // Close modal when clicking outside
    if (dom.codeModal) {
      dom.codeModal.addEventListener('click', (e) => {
        if (e.target === dom.codeModal) {
          dom.codeModal.classList.remove('active');
        }
      });
    }
    
    if (dom.presetModal) {
      dom.presetModal.addEventListener('click', (e) => {
        if (e.target === dom.presetModal) {
          dom.presetModal.classList.remove('active');
        }
      });
    }
    
    // Toggle gradient controls visibility
    if (dom.useGradientCheckbox) {
      dom.useGradientCheckbox.addEventListener('change', () => {
        if (dom.useGradientCheckbox.checked) {
          dom.solidColorControl.style.display = 'none';
          dom.gradientControls.style.display = 'block';
        } else {
          dom.solidColorControl.style.display = 'block';
          dom.gradientControls.style.display = 'none';
        }
        
        updateAllLayers();
      });
    }
    
    // Set up live updates for range inputs
    const liveInputs = document.querySelectorAll('[data-live="true"]');
    liveInputs.forEach(input => {
      // For range inputs, update the display value
      if (input.type === 'range') {
        const valueEl = document.getElementById(`${input.id}-value`);
        if (valueEl) {
          // Set initial formatted value
          const step = parseFloat(input.step) || 1;
          valueEl.textContent = formatValue(input.value, step);
          
          // Update value on input
          input.addEventListener('input', () => {
            valueEl.textContent = formatValue(input.value, step);
            
            // Special cases for direct updates
            if (input.id === 'svg-scale') {
              updateLayersScale(parseFloat(input.value));
            } 
            else if (input.id === 'svg-depth') {
              updateLayersDepth(parseInt(input.value));
            }
            else if (input.id === 'bloom-strength' || input.id === 'bloom-radius' || input.id === 'bloom-threshold') {
              updateBloomSettings();
            }
            else if (input.id === 'orbit-sensitivity' || input.id === 'zoom-speed' || input.id === 'pan-speed') {
              updateOrbitControls();
            }
            else {
              scheduleUpdate();
            }
          });
        }
      } else {
        // For other inputs (checkbox, color, etc)
        input.addEventListener('change', (e) => {
          // Special case for glow effect
          if (e.target.id === 'glow-effect') {
            updateBloomSettings();
          } else if (e.target.id === 'enable-orbit' || e.target.id.startsWith('orbit-')) {
            updateOrbitControls();
          } else {
            scheduleUpdate();
          }
        });
      }
    });
    
    // Mouse tracking for interaction
    if (state.renderer && state.renderer.domElement) {
      state.renderer.domElement.addEventListener('mousemove', updateMousePosition);
      state.renderer.domElement.addEventListener('touchmove', updateTouchPosition);
      state.renderer.domElement.addEventListener('mouseleave', clearMousePosition);
    }
    
    // Screenshot button
    if (dom.screenshotBtn) {
      dom.screenshotBtn.addEventListener('click', takeScreenshot);
    }
    
    // Theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyColorTheme(btn.dataset.theme);
      });
    });
  }

  /**
   * Update camera orbit controls from UI settings
   */
  function updateOrbitControls() {
    if (!state.controls) return;
    
    const enabled = document.getElementById('enable-orbit').checked;
    const sensitivity = parseFloat(document.getElementById('orbit-sensitivity').value) || 1;
    const zoomSpeed = parseFloat(document.getElementById('zoom-speed').value) || 1;
    const panSpeed = parseFloat(document.getElementById('pan-speed').value) || 1;
    
    state.controls.enabled = enabled;
    state.controls.rotateSpeed = sensitivity;
    state.controls.zoomSpeed = zoomSpeed;
    state.controls.panSpeed = panSpeed;
  }

  /**
   * Track mouse position for particle interaction
   */
  function updateMousePosition(event) {
    // Only update if mouse interaction is enabled
    const mouseInteractionEl = document.getElementById('mouse-interaction');
    if (!mouseInteractionEl || !mouseInteractionEl.checked) return;
    
    // Don't update if orbit controls are being used with mouse button down
    if (state.controls && state.controls.enabled && event.buttons > 0) {
      return;
    }
    
    // Calculate normalized device coordinates
    const sensitivity = parseInt(document.getElementById('interaction-sensitivity')?.value || 5) / 5;
    
    const rect = state.renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Create raycaster for 3D coordinates
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), state.camera);
    
    // Define a plane at z=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    
    // Calculate intersection
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) {
      state.mousePosition.copy(intersection);
      state.mouseMoved = true;
    }
  }

  /**
   * Track touch position for mobile interaction
   */
  function updateTouchPosition(event) {
    // Only update if mouse interaction is enabled
    const mouseInteractionEl = document.getElementById('mouse-interaction');
    if (!mouseInteractionEl || !mouseInteractionEl.checked) return;
    
    // Prevent default to avoid scrolling
    event.preventDefault();
    
    // Get the first touch
    if (event.touches.length > 0) {
      const touch = event.touches[0];
      
      // Calculate normalized device coordinates
      const rect = state.renderer.domElement.getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Create raycaster for 3D coordinates
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), state.camera);
      
      // Define a plane at z=0
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      
      // Calculate intersection
      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        state.mousePosition.copy(intersection);
        state.mouseMoved = true;
      }
    }
  }

  /**
   * Clear mouse position when cursor leaves canvas
   */
  function clearMousePosition() {
    state.mousePosition.set(0, 0, 0);
    state.mouseMoved = false;
  }

  /**
   * Format UI values with appropriate decimal places
   */
  function formatValue(value, step) {
    // Show decimal places based on step value
    if (step < 1) {
      const decimalPlaces = step.toString().split('.')[1].length;
      return parseFloat(value).toFixed(decimalPlaces);
    }
    return parseInt(value);
  }

  /**
   * Get scene container aspect ratio for camera setup
   */
  function getAspectRatio() {
    return dom.sceneContainer.clientWidth / dom.sceneContainer.clientHeight;
  }

  /**
   * Handle window resize events
   */
  function onWindowResize() {
    state.camera.aspect = getAspectRatio();
    state.camera.updateProjectionMatrix();
    
    const width = dom.sceneContainer.clientWidth;
    const height = dom.sceneContainer.clientHeight;
    
    state.renderer.setSize(width, height);
    if (state.composer) state.composer.setSize(width, height);
  }

  /**
   * Reset camera to default position
   */
  function resetCamera() {
    // Reset camera position
    state.camera.position.set(0, 0, 200);
    state.camera.lookAt(0, 0, 0);
    if (state.controls) state.controls.reset();
  }

  // Debounce variables
  let pendingUpdate = false;
  let updateTimeout;

  /**
   * Schedule particle update with debouncing to prevent too frequent updates
   */
  function scheduleUpdate() {
    if (pendingUpdate) clearTimeout(updateTimeout);
    
    pendingUpdate = true;
    updateTimeout = setTimeout(() => {
      pendingUpdate = false;
      updateAllLayers();
    }, 300); // 300ms debounce
  }

  /**
   * Update all layers based on current settings
   */
  function updateAllLayers() {
    if (state.layers.length === 0) {
      return;
    }
    
    showLoading(true);
    
    // Short timeout to ensure loading indicator shows
    setTimeout(() => {
      try {
        // Update each layer
        state.layers.forEach(layer => {
          updateLayer(layer);
        });
        
        // Update particle count display
        updateParticleCountDisplay();
        
        // Generate updated code
        generateCode();
      } catch (error) {
        console.error("Error updating layers:", error);
        showNotification("Error updating particles. Please try again.", "error");
      } finally {
        showLoading(false);
      }
    }, 100);
  }

  /**
   * Update the scale of all layers
   */
  function updateLayersScale(scale) {
    state.layers.forEach(layer => {
      if (layer.group) {
        layer.group.scale.set(scale, scale, scale);
      }
    });
    
    // Generate updated code
    generateCode();
  }

  /**
   * Update the depth of all layers (z-position of particles)
   */
  function updateLayersDepth(depth) {
    state.layers.forEach(layer => {
      updateLayerDepth(layer, depth);
    });
    
    // Generate updated code
    generateCode();
  }

  /**
   * Update a single layer's depth
   */
  function updateLayerDepth(layer, depth) {
    if (!layer.particles || layer.particles.length === 0) return;
    
    if (layer.useInstanced) {
      // For instanced mesh we need to update the instance matrix for each particle
      for (let i = 0; i < layer.particleCount; i++) {
        // Get original z-position data from instance attribute
        const depthFactor = layer.instanceData[i].depthFactor;
        
        // Calculate z position based on depth setting
        const zPos = depth * (depthFactor - 0.5) * 2; // Range from -depth to +depth
        
        // Update position
        layer.particles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(
          layer.instanceData[i].originalPosition.x,
          layer.instanceData[i].originalPosition.y,
          zPos
        ));
      }
      
      // Flag instance matrix needs update
      layer.particles.instanceMatrix.needsUpdate = true;
    } else {
      // For regular meshes
      layer.particles.forEach((particle, index) => {
        // Get a consistent random value for this particle
        const randomFactor = particle.userData.depthFactor || Math.random();
        particle.userData.depthFactor = randomFactor;
        
        // Calculate z position based on depth setting
        const zPos = depth * (randomFactor - 0.5) * 2; // Range from -depth to +depth
        particle.position.z = zPos;
        if (particle.userData.originalPosition) {
          particle.userData.originalPosition.z = zPos;
        }
        
        // Update original positions array for sand effect if needed
        if (layer.originalPositions && layer.originalPositions[index]) {
          layer.originalPositions[index].z = zPos;
        }
      });
    }
  }

  /**
   * Show or hide the loading spinner
   */
  function showLoading(show) {
    if (dom.loadingEl) {
      if (show) {
        dom.loadingEl.classList.add('active');
      } else {
        dom.loadingEl.classList.remove('active');
      }
    }
  }

  /**
   * Generate particles for all layers
   */
  function generateAllLayers() {
    if (state.layers.length === 0) {
      showNotification("Please upload an SVG file first.", "warning");
      return;
    }
    
    showLoading(true);
    
    setTimeout(() => {
      try {
        state.layers.forEach(layer => {
          updateLayer(layer);
        });
        
        // Update particle count
        updateParticleCountDisplay();
        
        // Generate code
        generateCode();
      } catch (error) {
        console.error("Error generating particles:", error);
        showNotification("Error generating particles. Please try again.", "error");
      } finally {
        showLoading(false);
      }
    }, 100);
  }

  /**
   * Read SVG file and create particles
   */
  function readSVGFile(file) {
    showLoading(true);
    
    const reader = new FileReader();
    
    reader.onload = function(event) {
      const svgString = event.target.result;
      const fileName = file.name;
      
      try {
        // Create a new layer with this SVG
        createLayer(svgString, fileName);
        
        // Hide the drop area since we now have particles
        if (dom.dropArea) {
          dom.dropArea.classList.add('hidden');
        }
      } catch (error) {
        console.error("Error processing SVG:", error);
        showNotification("Error processing SVG. File may be incompatible.", "error");
      } finally {
        showLoading(false);
      }
    };
    
    reader.onerror = function() {
      showNotification("Error reading file", "error");
      showLoading(false);
    };
    
    reader.readAsText(file);
  }

  /**
   * Create a new layer from SVG string
   */
  function createLayer(svgString, name) {
    const layerId = `layer-${state.nextLayerId++}`;
    
    // Create layer object
    const layer = {
      id: layerId,
      name: name || `Layer ${state.layers.length + 1}`,
      svgString: svgString,
      visible: true,
      group: new THREE.Group(),
      particles: [],
      instanceData: [], // For instanced rendering
      originalPositions: [],
      particleCount: 0,
      useInstanced: dom.useInstancedRenderingCheckbox && dom.useInstancedRenderingCheckbox.checked
    };
    
    // Add to scene
    state.scene.add(layer.group);
    
    // Add to layers array
    state.layers.push(layer);
    
    // Create layer UI element
    createLayerUI(layer);
    
    // Update empty layers message
    updateEmptyLayersMessage();
    
    // Set as active layer
    setActiveLayer(layerId);
    
    // Create particles for this layer
    processLayerSVG(layer);
    
    return layer;
  }

  /**
   * Process SVG for a layer and create particles
   */
  function processLayerSVG(layer) {
    try {
      // Clear existing particles
      clearLayerParticles(layer);
      
      // Process SVG
      createParticlesFromSVGString(layer, layer.svgString);
      
      // Update particle count
      updateParticleCountDisplay();
    } catch (error) {
      console.error("Error processing layer SVG:", error);
      showNotification(`Error processing layer "${layer.name}"`, "error");
    }
  }

  /**
   * Clear all particles from a layer
   */
  function clearLayerParticles(layer) {
    if (layer.group) {
      // Remove all children from the group
      while (layer.group.children.length > 0) {
        const child = layer.group.children[0];
        layer.group.remove(child);
        
        // Handle proper disposal
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    }
    
    // Reset layer data
    layer.particles = [];
    layer.instanceData = [];
    layer.originalPositions = [];
    layer.particleCount = 0;
  }

  /**
   * Update a layer with current settings
   */
  function updateLayer(layer) {
    if (!layer || !layer.svgString) return;
    
    // Clear existing particles
    clearLayerParticles(layer);
    
    // Get rendering method preference
    layer.useInstanced = dom.useInstancedRenderingCheckbox && dom.useInstancedRenderingCheckbox.checked;
    
    // Process SVG with current settings
    createParticlesFromSVGString(layer, layer.svgString);
  }

  /**
   * Create user interface for a layer
   */
  function createLayerUI(layer) {
    if (!dom.layerTemplate || !dom.layersList) return;
    
    // Clone the template
    const template = dom.layerTemplate.content.cloneNode(true);
    const li = template.querySelector('li');
    
    // Set layer ID
    li.dataset.layerId = layer.id;
    
    // Set layer name
    const nameEl = li.querySelector('.layer-name');
    if (nameEl) nameEl.textContent = layer.name;
    
    // Set visibility handler
    const visibilityEl = li.querySelector('.layer-visibility');
    if (visibilityEl) {
      // Set initial visibility state
      if (!layer.visible) {
        visibilityEl.classList.add('hidden');
      }
      
      // Add click handler for toggling visibility
      visibilityEl.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLayerVisibility(layer.id);
      });
    }
    
    // Set delete handler
    const deleteBtn = li.querySelector('.layer-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLayer(layer.id);
      });
    }
    
    // Set edit handler
    const editBtn = li.querySelector('.layer-edit');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Set this as active layer
        setActiveLayer(layer.id);
      });
    }
    
    // Make whole layer item select the layer
    li.addEventListener('click', () => {
      setActiveLayer(layer.id);
    });
    
    // Setup drag and drop for reordering
    setupLayerDragAndDrop(li);
    
    // Add to list
    dom.layersList.appendChild(li);
  }

  /**
   * Setup drag and drop functionality for layer reordering
   */
  function setupLayerDragAndDrop(layerEl) {
    layerEl.setAttribute('draggable', 'true');
    
    const handleEl = layerEl.querySelector('.layer-drag-handle');
    
    if (handleEl) {
      // Start drag when handle is used
      handleEl.addEventListener('mousedown', () => {
        layerEl.draggable = true;
      });
      
      handleEl.addEventListener('mouseup', () => {
        layerEl.draggable = false;
      });
    }
    
    layerEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', layerEl.dataset.layerId);
      layerEl.classList.add('dragging');
      
      // If handle exists, add dragging class
      if (handleEl) {
        handleEl.classList.add('dragging');
      }
    });
    
    layerEl.addEventListener('dragend', () => {
      layerEl.classList.remove('dragging');
      
      // If handle exists, remove dragging class
      if (handleEl) {
        handleEl.classList.remove('dragging');
      }
      
      // Remove all drop indicators
      document.querySelectorAll('.layer-drop-indicator').forEach(el => el.remove());
    });
    
    // Hover effects for drop target
    layerEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      
      // Remove any existing indicators
      document.querySelectorAll('.layer-drop-indicator').forEach(el => el.remove());
      
      // Get the drag source ID
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === layerEl.dataset.layerId) return;
      
      // Determine if we should insert before or after
      const rect = layerEl.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const isBelow = y > rect.height / 2;
      
      // Create drop indicator
      const indicator = document.createElement('div');
      indicator.classList.add('layer-drop-indicator');
      
      // Insert before or after based on position
      if (isBelow) {
        layerEl.after(indicator);
      } else {
        layerEl.before(indicator);
      }
    });
    
    layerEl.addEventListener('dragleave', () => {
      // Remove the specific indicator related to this element
      const next = layerEl.nextElementSibling;
      if (next && next.classList.contains('layer-drop-indicator')) {
        next.remove();
      }
      const prev = layerEl.previousElementSibling;
      if (prev && prev.classList.contains('layer-drop-indicator')) {
        prev.remove();
      }
    });
    
    layerEl.addEventListener('drop', (e) => {
      e.preventDefault();
      
      // Get the dragged layer ID
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === layerEl.dataset.layerId) return;
      
      // Determine insert position (before or after)
      const rect = layerEl.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const insertAfter = y > rect.height / 2;
      
      // Find indices for reordering
      const sourceIdx = state.layers.findIndex(l => l.id === draggedId);
      let targetIdx = state.layers.findIndex(l => l.id === layerEl.dataset.layerId);
      
      if (sourceIdx !== -1 && targetIdx !== -1) {
        if (insertAfter) targetIdx++;
        
        // Reorder the layer in our state array
        reorderLayer(sourceIdx, targetIdx);
        
        // Remove drop indicators
        document.querySelectorAll('.layer-drop-indicator').forEach(el => el.remove());
      }
    });
  }

  /**
   * Reorder a layer in the array and update scene graph
   */
  function reorderLayer(sourceIdx, targetIdx) {
    if (sourceIdx === targetIdx) return;
    
    // Update layers array
    const layer = state.layers.splice(sourceIdx, 1)[0];
    
    // Adjust target index if moving from before to after
    if (sourceIdx < targetIdx) targetIdx--;
    
    // Insert at target position
    state.layers.splice(targetIdx, 0, layer);
    
    // Update DOM order (UI)
    updateLayerUIOrder();
    
    // Update render order in scene
    updateSceneLayerOrder();
  }

  /**
   * Update the DOM order of layer UI elements to match state.layers
   */
  function updateLayerUIOrder() {
    if (!dom.layersList) return;
    
    const fragment = document.createDocumentFragment();
    
    // Append in reverse order (last layer at top)
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i];
      const layerEl = dom.layersList.querySelector(`[data-layer-id="${layer.id}"]`);
      if (layerEl) {
        fragment.appendChild(layerEl);
      }
    }
    
    // Clear and re-append in new order
    dom.layersList.innerHTML = '';
    dom.layersList.appendChild(fragment);
  }

  /**
   * Update the Three.js scene order to match state.layers
   */
  function updateSceneLayerOrder() {
    // Remove all layer groups
    state.layers.forEach(layer => {
      if (layer.group) {
        state.scene.remove(layer.group);
      }
    });
    
    // Add back in correct order (first layer at bottom)
    state.layers.forEach(layer => {
      if (layer.group) {
        state.scene.add(layer.group);
      }
    });
  }

  /**
   * Toggle visibility of a layer
   */
  function toggleLayerVisibility(layerId) {
    const layer = state.layers.find(l => l.id === layerId);
    if (!layer) return;
    
    // Toggle visibility
    layer.visible = !layer.visible;
    
    // Update group visibility
    if (layer.group) {
      layer.group.visible = layer.visible;
    }
    
    // Update UI
    const layerEl = dom.layersList.querySelector(`[data-layer-id="${layerId}"]`);
    if (layerEl) {
      const visibilityEl = layerEl.querySelector('.layer-visibility');
      if (visibilityEl) {
        if (layer.visible) {
          visibilityEl.classList.remove('hidden');
        } else {
          visibilityEl.classList.add('hidden');
        }
      }
    }
    
    // Update particle count
    updateParticleCountDisplay();
  }

  /**
   * Delete a layer
   */
  function deleteLayer(layerId) {
    const index = state.layers.findIndex(l => l.id === layerId);
    if (index === -1) return;
    
    const layer = state.layers[index];
    
    // Remove from scene
    if (layer.group) {
      clearLayerParticles(layer);
      state.scene.remove(layer.group);
      
      // Cleanup material caches and resources
      cleanupLayerResources(layer);
    }
    
    // Remove from state
    state.layers.splice(index, 1);
    
    // Remove from UI
    const layerEl = dom.layersList.querySelector(`[data-layer-id="${layerId}"]`);
    if (layerEl) {
      layerEl.remove();
    }
    
    // Update active layer if this was the active one
    if (state.activeLayerId === layerId) {
      if (state.layers.length > 0) {
        setActiveLayer(state.layers[0].id);
      } else {
        state.activeLayerId = null;
      }
    }
    
    // Update empty message
    updateEmptyLayersMessage();
    
    // Show drop area if no layers left
    if (state.layers.length === 0 && dom.dropArea) {
      dom.dropArea.classList.remove('hidden');
    }
    
    // Update particle count
    updateParticleCountDisplay();
  }

  /**
   * Clean up resources for a layer
   */
  function cleanupLayerResources(layer) {
    if (layer.useInstanced && layer.particles) {
      // Cleanup instanced mesh
      if (layer.particles.geometry) {
        layer.particles.geometry.dispose();
      }
      if (layer.particles.material) {
        if (Array.isArray(layer.particles.material)) {
          layer.particles.material.forEach(m => m.dispose());
        } else {
          layer.particles.material.dispose();
        }
      }
    } else if (Array.isArray(layer.particles)) {
      // Cleanup individual meshes
      layer.particles.forEach(particle => {
        if (particle.geometry) {
          particle.geometry.dispose();
        }
        if (particle.material) {
          particle.material.dispose();
        }
      });
    }
  }

  /**
   * Set a layer as the active editing layer
   */
  function setActiveLayer(layerId) {
    state.activeLayerId = layerId;
    
    // Update UI
    document.querySelectorAll('.layer-item').forEach(el => {
      el.classList.remove('active');
    });
    
    const activeEl = document.querySelector(`.layer-item[data-layer-id="${layerId}"]`);
    if (activeEl) {
      activeEl.classList.add('active');
    }
  }

  /**
   * Update the empty layers message visibility
   */
  function updateEmptyLayersMessage() {
    if (!dom.emptyLayersMessage) return;
    
    if (state.layers.length === 0) {
      dom.emptyLayersMessage.style.display = 'block';
    } else {
      dom.emptyLayersMessage.style.display = 'none';
    }
  }

  /**
   * Update the particle count display
   */
  function updateParticleCountDisplay() {
    if (!dom.particleCounter) return;
    
    // Count visible particles
    let count = 0;
    state.layers.forEach(layer => {
      if (layer.visible) {
        count += layer.particleCount;
      }
    });
    
    state.particleCount = count;
    dom.particleCounter.textContent = count.toLocaleString();
  }

  /**
   * Create material with proper caching
   */
  function createOrGetMaterial(color, type = 'fill') {
    const cacheKey = `${color}_${type}`;
    
    // Check if we already have this material
    if (resourceCache.materialCache.has(cacheKey)) {
      return resourceCache.materialCache.get(cacheKey);
    }
    
    // Create new material
    const opacity = type === 'fill' ? 0.8 : 0.9;
    const colorObj = new THREE.Color(color);
    
    // Brighten strokes slightly for visibility
    if (type === 'stroke') {
      colorObj.multiplyScalar(1.2);
    }
    
    const material = new THREE.MeshBasicMaterial({
      color: colorObj,
      transparent: true,
      opacity: opacity
    });
    
    // Store in cache
    resourceCache.materialCache.set(cacheKey, material);
    resourceCache.disposables.push(material);
    
    return material;
  }

  /**
   * Create particles from SVG string for a layer
   */
  function createParticlesFromSVGString(layer, svgString) {
    try {
      // Create temporary DOM element to parse SVG
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
      
      // Create canvas to draw SVG
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size (higher resolution for better sampling)
      canvas.width = 2000;
      canvas.height = 2000;
      
      // Create Image from SVG
      const img = new Image();
      const svgBlob = new Blob([svgString], {type: 'image/svg+xml'});
      const url = URL.createObjectURL(svgBlob);
      
      img.onload = function() {
        // Calculate aspect ratio to fit SVG in canvas
        const svgRatio = img.width / img.height;
        let drawWidth, drawHeight, offsetX, offsetY;
        
        if (svgRatio > 1) {
          drawWidth = canvas.width * 0.8;
          drawHeight = drawWidth / svgRatio;
          offsetX = canvas.width * 0.1;
          offsetY = (canvas.height - drawHeight) / 2;
        } else {
          drawHeight = canvas.height * 0.8;
          drawWidth = drawHeight * svgRatio;
          offsetX = (canvas.width - drawWidth) / 2;
          offsetY = canvas.height * 0.1;
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw SVG to canvas
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        
        // Get image data to sample pixels
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Get settings
        const settings = getSettings();
        
        // Set of points to sample from for particles
        const points = [];
        const colors = []; // Store colors for each point if preserving SVG colors
        
        // Determine if we should include strokes
        const includeStrokes = settings.includeStrokes;
        const strokeWidth = settings.strokeWidth;
        const strokeDetail = settings.strokeDetail;
        
        // Determine sampling density (lower value = denser sampling)
        const samplingDensity = settings.particleDensity;
        let samplingStep = samplingDensity * 2; // Base sampling step on density setting
        
        // Prepare for separate stroke sampling
        let strokePoints = [];
        let strokeColors = [];
        let fillPoints = [];
        let fillColors = [];
        
        // Sample points where pixels have alpha > 0
        for (let y = 0; y < canvas.height; y += samplingStep) {
          for (let x = 0; x < canvas.width; x += samplingStep) {
            const index = (y * canvas.width + x) * 4;
            if (data[index + 3] > 50) { // If pixel is not fully transparent
              // Create a point with random z-value for depth if enabled
              const svgDepth = settings.svgDepth;
              const depthFactor = Math.random();
              const z = svgDepth > 0 ? (depthFactor - 0.5) * 2 * svgDepth : 0;
              const point = new THREE.Vector3(
                (x - canvas.width / 2) * 0.1, // Scale down to fit in view
                -(y - canvas.height / 2) * 0.1, // Flip Y for Three.js coordinate system
                z // Add depth
              );
              
              // Get color from image data if preserving colors
              let color;
              if (settings.preserveColors) {
                color = `rgb(${data[index]}, ${data[index + 1]}, ${data[index + 2]})`;
              }
              
              // Add to general points
              points.push(point);
              colors.push(color);
              
              // Store separately for color mapping
              fillPoints.push(point);
              fillColors.push(color);
            }
          }
        }
        
        // If stroke detection is enabled
        if (includeStrokes) {
          try {
            // Create a secondary canvas for edge detection
            const edgeCanvas = document.createElement('canvas');
            const edgeCtx = edgeCanvas.getContext('2d');
            edgeCanvas.width = canvas.width;
            edgeCanvas.height = canvas.height;
            
            // Draw SVG to edge canvas with stroke rendering
            edgeCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
            
            // Apply edge detection filter (simple implementation)
            const edgeData = edgeCtx.getImageData(0, 0, canvas.width, canvas.height);
            const edgePixels = edgeData.data;
            
            // Sample the edges using a smaller sampling step for better detail
            const edgeSamplingStep = Math.max(1, samplingStep / strokeDetail);
            
            // Check for pixels that might be part of a stroke (edges)
            for (let y = edgeSamplingStep; y < canvas.height - edgeSamplingStep; y += edgeSamplingStep) {
              for (let x = edgeSamplingStep; x < canvas.width - edgeSamplingStep; x += edgeSamplingStep) {
                const index = (y * canvas.width + x) * 4;
                
                // Skip if pixel is fully transparent
                if (edgePixels[index + 3] < 50) continue;
                
                // Check surrounding pixels for edge detection
                const isEdge = checkIfEdge(edgePixels, x, y, canvas.width);
                
                if (isEdge) {
                  // Create a point for the stroke
                  const svgDepth = settings.svgDepth;
                  const depthFactor = Math.random();
                  const z = svgDepth > 0 ? (depthFactor - 0.5) * 2 * svgDepth : 0;
                  const point = new THREE.Vector3(
                    (x - canvas.width / 2) * 0.1,
                    -(y - canvas.height / 2) * 0.1,
                    z
                  );
                  
                  // Get color from edge data if preserving colors
                  let color;
                  if (settings.preserveColors) {
                    color = `rgb(${edgePixels[index]}, ${edgePixels[index + 1]}, ${edgePixels[index + 2]})`;
                  }
                  
                  // Add to general points and stroke points
                  points.push(point);
                  colors.push(color);
                  strokePoints.push(point);
                  strokeColors.push(color);
                }
              }
            }
          } catch (e) {
            console.warn("Error in stroke detection:", e);
          }
        }
        
        // Create particles from points
        createParticles(
          layer, 
          points, 
          strokePoints, 
          fillPoints, 
          settings, 
          colors, 
          strokeColors, 
          fillColors
        );
        
        // Clean up
        URL.revokeObjectURL(url);
      };
      
      img.onerror = function() {
        console.error('Error loading SVG');
        showLoading(false);
        showNotification("Error loading SVG. File may be corrupted.", "error");
        
        // Show the drop area again if there was an error
        if (dom.dropArea) {
          dom.dropArea.classList.remove('hidden');
        }
      };
      
      img.src = url;
    } catch (e) {
      console.error("Error creating particles from SVG:", e);
      showLoading(false);
      showNotification("Error processing SVG.", "error");
    }
  }

  /**
   * Helper function for edge detection
   */
  function checkIfEdge(data, x, y, width) {
    const center = (y * width + x) * 4;
    
    // Check if current pixel has alpha
    if (data[center + 3] < 50) return false;
    
    // Check surrounding pixels for changes in alpha (simple edge detection)
    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1]
    ];
    
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      const neighborIndex = (ny * width + nx) * 4;
      
      // Check if any neighbor has significantly different alpha
      if (data[neighborIndex + 3] < 50) {
        return true; // It's an edge pixel
      }
    }
    
    return false;
  }

  /**
   * Create particles using either instanced or traditional rendering
   */
  function createParticles(layer, points, strokePoints, fillPoints, settings, colors, strokeColors, fillColors) {
    try {
      // Use instanced rendering or traditional based on setting
      const useInstanced = layer.useInstanced && points.length > 500; // Only use for larger point counts
      
      // Sample points based on settings
      let sampledPoints = samplePoints(points, strokePoints, fillPoints, settings.particleCount, colors, strokeColors, fillColors);
      
      // Create particles using the appropriate method
      if (useInstanced) {
        createInstancedParticles(layer, sampledPoints, settings);
      } else {
        createTraditionalParticles(layer, sampledPoints, settings);
      }
      
      // Apply scale to the group
      layer.group.scale.set(settings.svgScale, settings.svgScale, settings.svgScale);
      
      // Update layer's particle count
      layer.particleCount = sampledPoints.length;
    } catch (e) {
      console.error("Error in createParticles:", e);
      showNotification("Error creating particles.", "error");
    }
  }

  /**
   * Sample points for particle creation
   */
  function samplePoints(points, strokePoints, fillPoints, targetCount, colors, strokeColors, fillColors) {
    let sampledPoints = [];
    
    if (points.length <= targetCount) {
      // Use all points if we have fewer than requested
      points.forEach((point, index) => {
        sampledPoints.push({
          point: point,
          isStroke: strokePoints.includes(point),
          color: colors ? colors[index] : null
        });
      });
    } else {
      // Calculate proportions for strokes and fills
      const strokeRatio = strokePoints.length / points.length;
      const strokeCount = Math.floor(targetCount * strokeRatio);
      const fillCount = targetCount - strokeCount;
      
      // Sample stroke points (prioritize them)
      if (strokePoints.length > 0) {
        const strokeIndices = new Set();
        while (strokeIndices.size < Math.min(strokeCount, strokePoints.length)) {
          strokeIndices.add(Math.floor(Math.random() * strokePoints.length));
        }
        
        for (const index of strokeIndices) {
          sampledPoints.push({
            point: strokePoints[index],
            isStroke: true,
            color: strokeColors ? strokeColors[index] : null
          });
        }
      }
      
      // Sample fill points
      if (fillPoints.length > 0) {
        const fillIndices = new Set();
        while (fillIndices.size < Math.min(fillCount, fillPoints.length)) {
          fillIndices.add(Math.floor(Math.random() * fillPoints.length));
        }
        
        for (const index of fillIndices) {
          sampledPoints.push({
            point: fillPoints[index],
            isStroke: false,
            color: fillColors ? fillColors[index] : null
          });
        }
      }
      
      // Fallback if categorization failed
      if (sampledPoints.length === 0) {
        const indices = new Set();
        while (indices.size < targetCount) {
          indices.add(Math.floor(Math.random() * points.length));
        }
        
        for (const index of indices) {
          sampledPoints.push({
            point: points[index],
            isStroke: false,
            color: colors ? colors[index] : null
          });
        }
      }
    }
    
    return sampledPoints;
  }

  /**
   * Create particles using instanced mesh for performance
   */
  function createInstancedParticles(layer, sampledPoints, settings) {
    // Create materials map for efficient material access
    const materialsMap = new Map();
    
    // Get default colors for fills and strokes
    const preserveColors = settings.preserveColors;
    const useGradient = settings.useGradient && !preserveColors;
    const defaultFillColor = settings.color;
    const defaultStrokeColor = tintColor(settings.color, 1.2);
    const gradientColor1 = settings.gradientColor1;
    const gradientColor2 = settings.gradientColor2;
    
    // Create shared geometries
    const sphereGeometry = resourceCache.particleGeometry;
    
    // Count of particles by color (for instanced meshes)
    const colorParticleCounts = new Map();
    
    // First, count how many particles of each color we'll need
    sampledPoints.forEach(pointData => {
      const point = pointData.point || pointData;
      const isStroke = pointData.isStroke || false;
      const userColor = pointData.color;
      
      let color;
      
      if (preserveColors && userColor) {
        // Use SVG's original color
        color = userColor;
      } else if (useGradient) {
        // Calculate position along the gradient (use y-position normalized to 0-1)
        const normalizedY = (point.y + 100) / 200; // Assuming y ranges roughly from -100 to 100
        color = interpolateColors(gradientColor1, gradientColor2, normalizedY);
      } else {
        // Use solid color
        color = isStroke ? defaultStrokeColor : defaultFillColor;
      }
      
      // Get or create count for this color
      const colorKey = `${color}_${isStroke ? 'stroke' : 'fill'}`;
      const count = colorParticleCounts.get(colorKey) || 0;
      colorParticleCounts.set(colorKey, count + 1);
    });
    
    // Create instanced meshes for each color
    colorParticleCounts.forEach((count, colorKey) => {
      const [color, type] = colorKey.split('_');
      
      // Create material
      const material = createOrGetMaterial(color, type);
      
      // Create instanced mesh
      const instancedMesh = new THREE.InstancedMesh(sphereGeometry, material, count);
      instancedMesh.frustumCulled = false; // Prevent disappearing when out of camera frustum
      
      // Store in materials map for later access
      materialsMap.set(colorKey, {
        mesh: instancedMesh,
        nextIndex: 0
      });
      
      // Add to layer group
      layer.group.add(instancedMesh);
    });
    
    // Initialize layer data
    layer.particles = [];
    layer.instanceData = [];
    layer.originalPositions = [];
    
    // Now place each particle in its corresponding instanced mesh
    sampledPoints.forEach(pointData => {
      const point = pointData.point || pointData;
      const isStroke = pointData.isStroke || false;
      const userColor = pointData.color;
      
      // Random size between min and max (strokes are slightly smaller)
      const sizeFactor = isStroke ? 0.8 : 1.0;
      const size = (settings.minSize + Math.random() * (settings.maxSize - settings.minSize)) * sizeFactor;
      
      // Determine color
      let color;
      
      if (preserveColors && userColor) {
        // Use SVG's original color
        color = userColor;
      } else if (useGradient) {
        // Calculate position along the gradient (use y-position normalized to 0-1)
        const normalizedY = (point.y + 100) / 200; // Assuming y ranges roughly from -100 to 100
        color = interpolateColors(gradientColor1, gradientColor2, normalizedY);
      } else {
        // Use solid color
        color = isStroke ? defaultStrokeColor : defaultFillColor;
      }
      
      // Get instance data for this color
      const colorKey = `${color}_${isStroke ? 'stroke' : 'fill'}`;
      const instanceData = materialsMap.get(colorKey);
      
      if (instanceData) {
        const { mesh, nextIndex } = instanceData;
        
        // Create transformation matrix for this instance
        const matrix = new THREE.Matrix4();
        matrix.makeTranslation(point.x, point.y, point.z);
        matrix.scale(new THREE.Vector3(size, size, size));
        
        // Set matrix at next available index
        mesh.setMatrixAt(nextIndex, matrix);
        
        // Push to layer particles array
        layer.particles.push(mesh);
        
        // Store original position and metadata
        const instanceMetadata = {
          originalPosition: point.clone(),
          size: size,
          isStroke: isStroke,
          mesh: mesh,
          index: nextIndex,
          depthFactor: point.z !== 0 ? (point.z / settings.svgDepth + 0.5) / 2 : Math.random(),
          angle: Math.random() * Math.PI * 2,
          speed: 0.05 + Math.random() * 0.05,
          amplitude: Math.random() * 2,
          offset: new THREE.Vector3(),
          velocity: new THREE.Vector3(0, 0, 0),
          noiseOffset: {
            x: Math.random() * 1000,
            y: Math.random() * 1000,
            z: Math.random() * 1000
          }
        };
        
        layer.instanceData.push(instanceMetadata);
        layer.originalPositions.push(point.clone());
        
        // Increment next index
        instanceData.nextIndex += 1;
      }
    });
    
    // Indicate instance matrices need update
    materialsMap.forEach(data => {
      data.mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /**
   * Create particles using traditional mesh approach
   */
  function createTraditionalParticles(layer, sampledPoints, settings) {
    try {
      // Get settings
      const preserveColors = settings.preserveColors;
      const useGradient = settings.useGradient && !preserveColors;
      const defaultFillColor = settings.color;
      const defaultStrokeColor = tintColor(settings.color, 1.2);
      const gradientColor1 = settings.gradientColor1;
      const gradientColor2 = settings.gradientColor2;
      
      // Initialize arrays
      layer.particles = [];
      layer.originalPositions = [];
      
      // Create particles
      sampledPoints.forEach(pointData => {
        const point = pointData.point || pointData;
        const isStroke = pointData.isStroke || false;
        const userColor = pointData.color;
        
        // Random size between min and max (strokes are slightly smaller)
        const sizeFactor = isStroke ? 0.8 : 1.0;
        const size = (settings.minSize + Math.random() * (settings.maxSize - settings.minSize)) * sizeFactor;
        
        // Choose material based on settings
        let material;
        
        if (preserveColors && userColor) {
          // Use SVG's original color
          material = createOrGetMaterial(userColor, isStroke ? 'stroke' : 'fill');
        } else if (useGradient) {
          // Calculate position along the gradient (use y-position normalized to 0-1)
          const normalizedY = (point.y + 100) / 200; // Assuming y ranges roughly from -100 to 100
          const color = interpolateColors(gradientColor1, gradientColor2, normalizedY);
          material = createOrGetMaterial(color, isStroke ? 'stroke' : 'fill');
        } else {
          // Use solid color
          const color = isStroke ? defaultStrokeColor : defaultFillColor;
          material = createOrGetMaterial(color, isStroke ? 'stroke' : 'fill');
        }
        
        // Create mesh with sphere geometry
        const mesh = new THREE.Mesh(resourceCache.particleGeometry, material);
        mesh.position.copy(point);
        mesh.scale.set(size, size, size);
        
        // Store original position and parameters for animation
        mesh.userData.originalPosition = point.clone();
        layer.originalPositions.push(point.clone()); // Store separately for sand effect
        mesh.userData.size = size;
        mesh.userData.isStroke = isStroke;
        mesh.userData.depthFactor = point.z !== 0 ? (point.z / settings.svgDepth + 0.5) / 2 : Math.random(); // Store normalized depth factor
        
        // For sand effect
        mesh.userData.velocity = new THREE.Vector3(0, 0, 0);
        
        // For animation
        mesh.userData.angle = Math.random() * Math.PI * 2;
        mesh.userData.speed = 0.05 + Math.random() * 0.05;
        mesh.userData.amplitude = Math.random() * 2;
        mesh.userData.offset = new THREE.Vector3();
        
        // For noise
        mesh.userData.noiseOffset = {
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          z: Math.random() * 1000
        };
        
        layer.group.add(mesh);
        layer.particles.push(mesh);
      });
    } catch (e) {
      console.error("Error in createTraditionalParticles:", e);
    }
  }

  /**
   * Update all particles animation
   */
  function updateParticlesAnimation(deltaTime) {
    // Skip if no layers
    if (state.layers.length === 0) return;
    
    try {
      const settings = getSettings();
      const time = performance.now() * 0.001 * settings.animationSpeed * 0.5;
      
      // Get sand effect parameters if enabled
      const sandEffect = settings.sandEffect;
      const sandStrength = settings.sandStrength;
      const sandReturn = settings.sandReturn;
      
      // Mouse interaction parameters
      const mouseInteraction = settings.mouseInteraction && state.mouseMoved;
      const repelEffect = settings.repelEffect;
      const interactionRadius = settings.interactionRadius;
      const interactionStrength = settings.interactionStrength;
      
      // Update each visible layer
      state.layers.forEach(layer => {
        if (!layer.visible) return;
        
        // Choose the appropriate update method based on rendering type
        if (layer.useInstanced) {
          updateInstancedParticles(
            layer, 
            time, 
            settings, 
            mouseInteraction, 
            repelEffect, 
            interactionRadius, 
            interactionStrength, 
            sandEffect, 
            sandStrength, 
            sandReturn
          );
        } else {
          updateTraditionalParticles(
            layer, 
            time, 
            settings, 
            mouseInteraction, 
            repelEffect, 
            interactionRadius, 
            interactionStrength, 
            sandEffect, 
            sandStrength, 
            sandReturn
          );
        }
      });
    } catch (e) {
      console.error("Error in updateParticlesAnimation:", e);
    }
  }

  /**
   * Update instanced particles for a layer
   */
  function updateInstancedParticles(
    layer, 
    time, 
    settings, 
    mouseInteraction, 
    repelEffect, 
    interactionRadius, 
    interactionStrength, 
    sandEffect, 
    sandStrength, 
    sandReturn
  ) {
    // Skip if no instance data
    if (!layer.instanceData || layer.instanceData.length === 0) return;
    
    // Group instanced meshes for efficient updates
    const meshUpdates = new Map();
    
    // Process each particle
    layer.instanceData.forEach((data, index) => {
      const { mesh, originalPosition, size, isStroke, depthFactor, angle, speed, amplitude, noiseOffset, index: instanceIndex } = data;
      
      // Skip if mesh doesn't exist or isn't visible
      if (!mesh || !mesh.visible) return;
      
      // Initialize position for this frame
      const currentMatrix = new THREE.Matrix4();
      mesh.getMatrixAt(instanceIndex, currentMatrix);
      
      // Extract current position from matrix
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      currentMatrix.decompose(position, quaternion, scale);
      
      // Calculate new position
      const newPosition = originalPosition.clone();
      
      // Apply noise or sine wave animation
      if (settings.noiseMovement) {
        // Update noise offsets
        data.noiseOffset.x += 0.002 * settings.animationSpeed;
        data.noiseOffset.y += 0.002 * settings.animationSpeed;
        data.noiseOffset.z += 0.002 * settings.animationSpeed;
        
        // Get 3D noise values for more natural movement
        const noiseX = state.simplex.noise3D(
          data.noiseOffset.x, 
          data.noiseOffset.y, 
          0
        ) * settings.noiseScale * 100;
        
        const noiseY = state.simplex.noise3D(
          data.noiseOffset.y, 
          data.noiseOffset.z, 
          0
        ) * settings.noiseScale * 100;
        
        const noiseZ = state.simplex.noise3D(
          data.noiseOffset.z, 
          data.noiseOffset.x, 
          0
        ) * settings.noiseScale * 50;
        
        // Apply noise as offset
        data.offset.x = noiseX;
        data.offset.y = noiseY;
        // Apply less z-noise to maintain the general shape
        data.offset.z = noiseZ * (settings.svgDepth > 0 ? 1 : 0);
        
        // Add noise offset to position
        newPosition.add(data.offset);
      } else {
        // Simple sine wave animation
        data.angle += data.speed * settings.animationSpeed;
        
        data.offset.x = Math.sin(data.angle + time) * data.amplitude;
        data.offset.y = Math.cos(data.angle + time * 1.5) * data.amplitude;
        
        // Add subtle z movement if depth is enabled
        if (settings.svgDepth > 0) {
          data.offset.z = Math.sin(data.angle + time * 0.7) * data.amplitude * 0.5;
        }
        
        // Add sine wave offset to position
        newPosition.add(data.offset);
      }
      
      // Slightly different animation for stroke particles
      if (isStroke) {
        // Strokes move a bit more
        data.offset.multiplyScalar(1.2);
      }
      
      // Apply mouse interaction
      let mouseDisplacement = new THREE.Vector3();
      
      if (mouseInteraction && state.mousePosition.length() > 0) {
        // Calculate distance from mouse to particle
        const distanceToMouse = position.distanceTo(state.mousePosition);
        
        if (distanceToMouse < interactionRadius * layer.group.scale.x) {
          // Calculate force based on distance
          const forceFactor = (interactionRadius * layer.group.scale.x - distanceToMouse) / (interactionRadius * layer.group.scale.x);
          const force = interactionStrength * forceFactor;
          
          // Calculate force direction
          const forceDirection = new THREE.Vector3()
            .subVectors(position, state.mousePosition)
            .normalize();
          
          // Calculate displacement
          mouseDisplacement = forceDirection.multiplyScalar(force);
          
          if (repelEffect) {
            // Push away from mouse
            newPosition.add(mouseDisplacement);
          } else {
            // Pull toward mouse
            newPosition.sub(mouseDisplacement);
          }
          
          // For sand effect, also update velocity
          if (sandEffect) {
            if (repelEffect) {
              data.velocity.add(mouseDisplacement.multiplyScalar(sandStrength * 0.1));
            } else {
              data.velocity.sub(mouseDisplacement.multiplyScalar(sandStrength * 0.1));
            }
          }
        }
      }
      
      // If sand effect is enabled, apply physics
      if (sandEffect) {
        // Get the original target position (without mouse interaction)
        const targetPosition = layer.originalPositions[index] ? 
                              layer.originalPositions[index].clone().add(data.offset) : 
                              newPosition.clone();
        
        // Calculate direction vector to target
        const direction = targetPosition.clone().sub(position);
        
        // Apply return force toward original position
        const returnForce = direction.multiplyScalar(0.05 * sandReturn);
        data.velocity.add(returnForce);
        
        // Apply damping to velocity (air resistance)
        data.velocity.multiplyScalar(0.95);
        
        // Add velocity to position
        newPosition.copy(position.clone().add(data.velocity));
      }
      
      // Prepare matrix update
      const newMatrix = new THREE.Matrix4();
      newMatrix.makeTranslation(newPosition.x, newPosition.y, newPosition.z);
      
      // Add rotation for more lively particles
      const rotationX = new THREE.Matrix4().makeRotationX(0.01 * settings.animationSpeed);
      const rotationY = new THREE.Matrix4().makeRotationY(0.01 * settings.animationSpeed);
      newMatrix.multiply(rotationX).multiply(rotationY);
      
      // Apply scaling
      newMatrix.scale(new THREE.Vector3(size, size, size));
      
      // Add to update batch for this mesh
      if (!meshUpdates.has(mesh)) {
        meshUpdates.set(mesh, []);
      }
      meshUpdates.get(mesh).push({ index: instanceIndex, matrix: newMatrix });
    });
    
    // Update all instance matrices in batches
    meshUpdates.forEach((updates, mesh) => {
      updates.forEach(update => {
        mesh.setMatrixAt(update.index, update.matrix);
      });
      
      // Flag instance matrix needs update
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /**
   * Update traditional (non-instanced) particles for a layer
   */
  function updateTraditionalParticles(
    layer, 
    time, 
    settings, 
    mouseInteraction, 
    repelEffect, 
    interactionRadius, 
    interactionStrength, 
    sandEffect, 
    sandStrength, 
    sandReturn
  ) {
    if (!layer.particles || layer.particles.length === 0) return;
    
    // Update particles
    layer.particles.forEach((particle, index) => {
      // Skip if not visible
      if (!particle.visible) return;
      
      // Initialize position for this frame
      const currentPosition = particle.position.clone();
      let newPosition = particle.userData.originalPosition ? 
                       particle.userData.originalPosition.clone() : 
                       new THREE.Vector3();
      
      // Apply noise if enabled
      if (settings.noiseMovement) {
        // Update noise offsets
        particle.userData.noiseOffset.x += 0.002 * settings.animationSpeed;
        particle.userData.noiseOffset.y += 0.002 * settings.animationSpeed;
        particle.userData.noiseOffset.z += 0.002 * settings.animationSpeed;
        
        // Get 3D noise values for more natural movement
        const noiseX = state.simplex.noise3D(
          particle.userData.noiseOffset.x, 
          particle.userData.noiseOffset.y, 
          0
        ) * settings.noiseScale * 100;
        
        const noiseY = state.simplex.noise3D(
          particle.userData.noiseOffset.y, 
          particle.userData.noiseOffset.z, 
          0
        ) * settings.noiseScale * 100;
        
        const noiseZ = state.simplex.noise3D(
          particle.userData.noiseOffset.z, 
          particle.userData.noiseOffset.x, 
          0
        ) * settings.noiseScale * 50;
        
        // Apply noise as offset
        particle.userData.offset.x = noiseX;
        particle.userData.offset.y = noiseY;
        // Apply less z-noise to maintain the general shape
        particle.userData.offset.z = noiseZ * (settings.svgDepth > 0 ? 1 : 0);
        
        // Add noise offset to position
        newPosition.add(particle.userData.offset);
      } else {
        // Simple sine wave animation
        particle.userData.angle += particle.userData.speed * settings.animationSpeed;
        
        particle.userData.offset.x = Math.sin(
          particle.userData.angle + time
        ) * particle.userData.amplitude;
        
        particle.userData.offset.y = Math.cos(
          particle.userData.angle + time * 1.5
        ) * particle.userData.amplitude;
        
        // Add subtle z movement if depth is enabled
        if (settings.svgDepth > 0) {
          particle.userData.offset.z = Math.sin(
            particle.userData.angle + time * 0.7
          ) * particle.userData.amplitude * 0.5;
        }
        
        // Add sine wave offset to position
        newPosition.add(particle.userData.offset);
      }
      
      // Slightly different animation for stroke particles
      if (particle.userData.isStroke) {
        // Strokes move a bit more
        particle.userData.offset.multiplyScalar(1.2);
      }
      
      // Apply mouse interaction
      let mouseDisplacement = new THREE.Vector3();
      
      if (mouseInteraction && state.mousePosition.length() > 0) {
        // Calculate distance from mouse to particle
        const distanceToMouse = particle.position.distanceTo(state.mousePosition);
        
        if (distanceToMouse < interactionRadius * layer.group.scale.x) {
          // Calculate force based on distance
          const forceFactor = (interactionRadius * layer.group.scale.x - distanceToMouse) / (interactionRadius * layer.group.scale.x);
          const force = interactionStrength * forceFactor;
          
          // Calculate force direction
          const forceDirection = new THREE.Vector3()
            .subVectors(particle.position, state.mousePosition)
            .normalize();
          
          // Calculate displacement
          mouseDisplacement = forceDirection.multiplyScalar(force);
          
          if (repelEffect) {
            // Push away from mouse
            newPosition.add(mouseDisplacement);
          } else {
            // Pull toward mouse
            newPosition.sub(mouseDisplacement);
          }
          
          // For sand effect, also update velocity
          if (sandEffect) {
            if (repelEffect) {
              particle.userData.velocity.add(mouseDisplacement.multiplyScalar(sandStrength * 0.1));
            } else {
              particle.userData.velocity.sub(mouseDisplacement.multiplyScalar(sandStrength * 0.1));
            }
          }
        }
      }
      
      // If sand effect is enabled, apply physics
      if (sandEffect) {
        // Get the original target position (without mouse interaction)
        const targetPosition = layer.originalPositions[index] ? 
                              layer.originalPositions[index].clone().add(particle.userData.offset) : 
                              newPosition.clone();
        
        // Calculate direction vector to target
        const direction = targetPosition.clone().sub(currentPosition);
        
        // Apply return force toward original position
        const returnForce = direction.multiplyScalar(0.05 * sandReturn);
        particle.userData.velocity.add(returnForce);
        
        // Apply damping to velocity (air resistance)
        particle.userData.velocity.multiplyScalar(0.95);
        
        // Add velocity to position
        newPosition = currentPosition.clone().add(particle.userData.velocity);
      }
      
      // Update particle position
      particle.position.copy(newPosition);
      
      // Subtle rotation for more lively particles
      particle.rotation.x += 0.01 * settings.animationSpeed;
      particle.rotation.y += 0.01 * settings.animationSpeed;
    });
  }

  /**
   * Animation loop
   */
  function animate(timestamp) {
    requestAnimationFrame(animate);
    
    try {
      // Update controls
      if (state.controls) state.controls.update();
      
      // Calculate delta time
      const deltaTime = timestamp - state.lastFrameTime;
      state.lastFrameTime = timestamp;
      
      // Update FPS counter
      updateFPSCounter(deltaTime);
      
      // Update particles animation
      updateParticlesAnimation(deltaTime);
      
      // Render with post-processing if enabled
      const glowEffectEl = document.getElementById('glow-effect');
      if (glowEffectEl && glowEffectEl.checked && state.composer) {
        state.composer.render();
      } else {
        state.renderer.render(state.scene, state.camera);
      }
    } catch (e) {
      console.error("Error in animate loop:", e);
    }
  }

  /**
   * Update FPS counter
   */
  function updateFPSCounter(deltaTime) {
    if (!dom.fpsCounter) return;
    
    // Count frames
    state.frameCounter++;
    state.fpsUpdateTime += deltaTime;
    
    // Update FPS display every 500ms
    if (state.fpsUpdateTime >= 500) {
      // Calculate FPS
      const fps = Math.round(state.frameCounter / (state.fpsUpdateTime / 1000));
      
      // Update display
      dom.fpsCounter.textContent = fps;
      
      // Reset counters
      state.frameCounter = 0;
      state.fpsUpdateTime = 0;
      
      // Add color indicator for performance
      if (fps >= 55) {
        dom.fpsCounter.style.color = '#10b981'; // Green for good performance
      } else if (fps >= 30) {
        dom.fpsCounter.style.color = '#f59e0b'; // Yellow for acceptable performance
      } else {
        dom.fpsCounter.style.color = '#ef4444'; // Red for poor performance
      }
    }
  }

  /**
   * Get current settings from UI elements
   */
  function getSettings() {
    try {
      return {
        particleCount: parseInt(document.getElementById('particle-count')?.value || 1500),
        particleDensity: parseInt(document.getElementById('particle-density')?.value || 4),
        minSize: parseFloat(document.getElementById('min-size')?.value || 0.5),
        maxSize: parseFloat(document.getElementById('max-size')?.value || 1.5),
        color: document.getElementById('particle-color')?.value || '#6366f1',
        useGradient: document.getElementById('use-gradient')?.checked || true,
        gradientColor1: document.getElementById('gradient-color1')?.value || '#6366f1',
        gradientColor2: document.getElementById('gradient-color2')?.value || '#ec4899',
        preserveColors: document.getElementById('preserve-colors')?.checked || false,
        animationSpeed: parseFloat(document.getElementById('animation-speed')?.value || 1),
        mouseInteraction: document.getElementById('mouse-interaction')?.checked || true,
        sandEffect: document.getElementById('sand-effect')?.checked || false,
        sandStrength: parseFloat(document.getElementById('sand-strength')?.value || 5),
        sandReturn: parseFloat(document.getElementById('sand-return')?.value || 1),
        repelEffect: document.getElementById('repel-effect')?.checked || false,
        interactionRadius: parseInt(document.getElementById('interaction-radius')?.value || 80),
        interactionStrength: parseFloat(document.getElementById('interaction-strength')?.value || 3),
        interactionSensitivity: parseInt(document.getElementById('interaction-sensitivity')?.value || 5),
        glowEffect: document.getElementById('glow-effect')?.checked || true,
        bloomStrength: parseFloat(document.getElementById('bloom-strength')?.value || 0.9),
        bloomRadius: parseFloat(document.getElementById('bloom-radius')?.value || 0.4),
        bloomThreshold: parseFloat(document.getElementById('bloom-threshold')?.value || 0.85),
        noiseMovement: document.getElementById('noise-movement')?.checked || true,
        noiseScale: parseFloat(document.getElementById('noise-scale')?.value || 0.02),
        includeStrokes: document.getElementById('include-strokes')?.checked || true,
        strokeWidth: parseInt(document.getElementById('stroke-width')?.value || 2),
        strokeDetail: parseInt(document.getElementById('stroke-detail')?.value || 5),
        enableOrbit: document.getElementById('enable-orbit')?.checked || true,
        orbitSensitivity: parseFloat(document.getElementById('orbit-sensitivity')?.value || 1),
        zoomSpeed: parseFloat(document.getElementById('zoom-speed')?.value || 1),
        panSpeed: parseFloat(document.getElementById('pan-speed')?.value || 1),
        svgScale: parseFloat(document.getElementById('svg-scale')?.value || 1),
        svgDepth: parseInt(document.getElementById('svg-depth')?.value || 20),
        useInstanced: document.getElementById('use-instanced-rendering')?.checked || true
      };
    } catch (e) {
      console.error("Error getting settings:", e);
      // Return defaults if there's an error
      return {
        particleCount: 1500,
        particleDensity: 4,
        minSize: 0.5,
        maxSize: 1.5,
        color: '#6366f1',
        useGradient: true,
        gradientColor1: '#6366f1',
        gradientColor2: '#ec4899',
        preserveColors: false,
        animationSpeed: 1,
        mouseInteraction: true,
        sandEffect: false,
        sandStrength: 5,
        sandReturn: 1,
        repelEffect: false,
        interactionRadius: 80,
        interactionStrength: 3,
        interactionSensitivity: 5,
        glowEffect: true,
        bloomStrength: 0.9,
        bloomRadius: 0.4,
        bloomThreshold: 0.85,
        noiseMovement: true,
        noiseScale: 0.02,
        includeStrokes: true,
        strokeWidth: 2,
        strokeDetail: 5,
        enableOrbit: true,
        orbitSensitivity: 1,
        zoomSpeed: 1,
        panSpeed: 1,
        svgScale: 1,
        svgDepth: 20,
        useInstanced: true
      };
    }
  }

  /**
   * Apply settings values to all UI inputs
   */
  function applySettings(settings) {
    try {
      // Apply all settings to UI elements
      const elements = {
        'particle-count': { value: settings.particleCount, display: settings.particleCount.toString() },
        'particle-density': { value: settings.particleDensity, display: settings.particleDensity.toString() },
        'min-size': { value: settings.minSize, display: settings.minSize.toFixed(1) },
        'max-size': { value: settings.maxSize, display: settings.maxSize.toFixed(1) },
        'particle-color': { value: settings.color },
        'use-gradient': { checked: settings.useGradient },
        'preserve-colors': { checked: settings.preserveColors },
        'gradient-color1': { value: settings.gradientColor1 },
        'gradient-color2': { value: settings.gradientColor2 },
        'animation-speed': { value: settings.animationSpeed, display: settings.animationSpeed.toFixed(1) },
        'mouse-interaction': { checked: settings.mouseInteraction },
        'repel-effect': { checked: settings.repelEffect },
        'sand-effect': { checked: settings.sandEffect },
        'sand-strength': { value: settings.sandStrength, display: settings.sandStrength.toFixed(1) },
        'sand-return': { value: settings.sandReturn, display: settings.sandReturn.toFixed(1) },
        'interaction-radius': { value: settings.interactionRadius, display: settings.interactionRadius.toString() },
        'interaction-strength': { value: settings.interactionStrength, display: settings.interactionStrength.toFixed(1) },
        'interaction-sensitivity': { value: settings.interactionSensitivity, display: settings.interactionSensitivity.toString() },
        'glow-effect': { checked: settings.glowEffect },
        'bloom-strength': { value: settings.bloomStrength, display: settings.bloomStrength.toFixed(1) },
        'bloom-radius': { value: settings.bloomRadius, display: settings.bloomRadius.toFixed(2) },
        'bloom-threshold': { value: settings.bloomThreshold, display: settings.bloomThreshold.toFixed(2) },
        'noise-movement': { checked: settings.noiseMovement },
        'noise-scale': { value: settings.noiseScale, display: settings.noiseScale.toFixed(3) },
        'include-strokes': { checked: settings.includeStrokes },
        'stroke-width': { value: settings.strokeWidth, display: settings.strokeWidth.toString() },
        'stroke-detail': { value: settings.strokeDetail, display: settings.strokeDetail.toString() },
        'enable-orbit': { checked: settings.enableOrbit },
        'orbit-sensitivity': { value: settings.orbitSensitivity, display: settings.orbitSensitivity.toFixed(1) },
        'zoom-speed': { value: settings.zoomSpeed, display: settings.zoomSpeed.toFixed(1) },
        'pan-speed': { value: settings.panSpeed, display: settings.panSpeed.toFixed(1) },
        'svg-scale': { value: settings.svgScale, display: settings.svgScale.toFixed(1) },
        'svg-depth': { value: settings.svgDepth, display: settings.svgDepth.toString() },
        'use-instanced-rendering': { checked: settings.useInstanced }
      };
      
      // Update each element if it exists
      for (const [id, config] of Object.entries(elements)) {
        const element = document.getElementById(id);
        if (!element) continue;
        
        if ('checked' in config) {
          element.checked = config.checked;
        }
        
        if ('value' in config) {
          element.value = config.value;
        }
        
        if ('display' in config) {
          const valueElement = document.getElementById(`${id}-value`);
          if (valueElement) {
            valueElement.textContent = config.display;
          }
        }
      }
      
      // Set visibility states
      if (dom.solidColorControl && dom.gradientControls) {
        dom.solidColorControl.style.display = settings.useGradient ? 'none' : 'block';
        dom.gradientControls.style.display = settings.useGradient ? 'block' : 'none';
      }
      
      // Update systems that depend on settings
      updateBloomSettings();
      updateOrbitControls();
      
      // Update all layers with new settings
      updateAllLayers();
    } catch (e) {
      console.error("Error applying settings:", e);
      showNotification("Error applying settings", "error");
    }
  }

  /**
   * Reset settings to defaults
   */
  function resetSettings() {
    try {
      // Default settings
      const defaultSettings = {
        particleCount: 1500,
        particleDensity: 4,
        minSize: 0.5,
        maxSize: 1.5,
        color: '#6366f1',
        useGradient: true,
        gradientColor1: '#6366f1',
        gradientColor2: '#ec4899',
        preserveColors: false,
        animationSpeed: 1,
        mouseInteraction: true,
        sandEffect: false,
        sandStrength: 5,
        sandReturn: 1,
        repelEffect: false,
        interactionRadius: 80,
        interactionStrength: 3,
        interactionSensitivity: 5,
        glowEffect: true,
        bloomStrength: 0.9,
        bloomRadius: 0.4,
        bloomThreshold: 0.85,
        noiseMovement: true,
        noiseScale: 0.02,
        includeStrokes: true,
        strokeWidth: 2,
        strokeDetail: 5,
        enableOrbit: true,
        orbitSensitivity: 1,
        zoomSpeed: 1,
        panSpeed: 1,
        svgScale: 1,
        svgDepth: 20,
        useInstanced: true
      };
      
      // Apply default settings
      applySettings(defaultSettings);
      
      // Reset camera view
      resetCamera();
      
      // Clear all layers
      while (state.layers.length > 0) {
        deleteLayer(state.layers[0].id);
      }
      
      // Show the drop area again
      if (dom.dropArea) {
        dom.dropArea.classList.remove('hidden');
      }
      
      // Clear preset selector
      if (dom.presetSelector) {
        dom.presetSelector.value = '';
      }
      
      showNotification("Settings reset to defaults", "success");
    } catch (e) {
      console.error("Error in resetSettings:", e);
      showNotification("Error resetting settings", "error");
    }
  }

  /**
   * Copy generated code to clipboard
   */
  function copyCode() {
    try {
      const code = dom.codeEl.textContent;
      navigator.clipboard.writeText(code).then(() => {
        showNotification("Code copied to clipboard!", "success");
      });
    } catch (e) {
      console.error("Error copying code:", e);
      showNotification("Error copying code. Please try again.", "error");
    }
  }

  /**
   * Generate code based on current settings and layers
   */
  function generateCode() {
    try {
      const settings = getSettings();
      const currentDate = new Date().toLocaleString();
      
      // Create the code header
      let code = `// SVG Partycle Generator (Version 2.0)
// Created by Enrico Deiana - https://www.enricodeiana.design/
// Generated on ${currentDate}

// Required imports:
// <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.min.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/simplex-noise@2.4.0/simplex-noise.min.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js"></script>

// Initialize the application
const ParticleSystem = (function() {
  // Private variables
  let camera, scene, renderer, controls;
  let composer, bloomPass;
  let simplex = new SimplexNoise();
  let layers = [];
  let mousePosition = new THREE.Vector3();
  let mouseMoved = false;
  
  // Initialize the application
  function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('Container element not found');
      return false;
    }
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    
    // Create camera
    camera = new THREE.PerspectiveCamera(
      60, container.clientWidth / container.clientHeight, 0.1, 1000
    );
    camera.position.z = 200;
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    
    // Setup post-processing for bloom effect
    setupPostProcessing();
    
    // Add OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enabled = ${settings.enableOrbit};
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = ${settings.orbitSensitivity};
    controls.zoomSpeed = ${settings.zoomSpeed};
    controls.panSpeed = ${settings.panSpeed};
    controls.screenSpacePanning = true;
    controls.minDistance = 50;
    controls.maxDistance = 500;
    
    // Setup mouse interaction
    setupMouseInteraction();
    
    // Handle window resize
    window.addEventListener('resize', () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
      composer.setSize(width, height);
    });
    
    // Start animation loop
    animate();
    
    return true;
  }
  
  // Setup post-processing
  function setupPostProcessing() {
    composer = new THREE.EffectComposer(renderer);
    
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
      ${settings.bloomStrength}, // Strength
      ${settings.bloomRadius}, // Radius
      ${settings.bloomThreshold} // Threshold
    );
    bloomPass.enabled = ${settings.glowEffect};
    composer.addPass(bloomPass);
  }
  
  // Setup mouse interaction
  function setupMouseInteraction() {
    renderer.domElement.addEventListener('mousemove', (event) => {
      if (!${settings.mouseInteraction}) return;
      
      // Don't update if orbit controls are being used with mouse button down
      if (controls.enabled && event.buttons > 0) return;
      
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersection = new THREE.Vector3();
      
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        mousePosition.copy(intersection);
        mouseMoved = true;
      }
    });
    
    renderer.domElement.addEventListener('mouseleave', () => {
      mousePosition.set(0, 0, 0);
      mouseMoved = false;
    });
    
    // Touch support
    renderer.domElement.addEventListener('touchmove', (event) => {
      if (!${settings.mouseInteraction}) return;
      
      event.preventDefault();
      
      if (event.touches.length > 0) {
        const touch = event.touches[0];
        
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const intersection = new THREE.Vector3();
        
        if (raycaster.ray.intersectPlane(plane, intersection)) {
          mousePosition.copy(intersection);
          mouseMoved = true;
        }
      }
    }, { passive: false });
  }

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    // Update controls
    if (controls) controls.update();
    
    // Update particles animation
    updateParticlesAnimation();
    
    // Render with post-processing if enabled
    if (${settings.glowEffect} && composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }
  
  // SVG layer management
  let nextLayerId = 1;
  
  // Create a new layer from SVG
  function addSVGLayer(svgString, name) {
    const layerId = nextLayerId++;
    const layerName = name || \`Layer \${layerId}\`;
    
    // Create layer object
    const layer = {
      id: layerId,
      name: layerName,
      visible: true,
      group: new THREE.Group(),
      useInstanced: ${settings.useInstanced}
    };
    
    // Add to scene
    scene.add(layer.group);
    
    // Add to layers array
    layers.push(layer);
    
    // Process SVG
    processSVG(layer, svgString);
    
    return layerId;
  }
  
  // Process SVG for a layer
  function processSVG(layer, svgString) {
    const settings = {
      particleCount: ${settings.particleCount},
      particleDensity: ${settings.particleDensity},
      minSize: ${settings.minSize},
      maxSize: ${settings.maxSize},
      color: '${settings.color}',
      useGradient: ${settings.useGradient},
      gradientColor1: '${settings.gradientColor1}',
      gradientColor2: '${settings.gradientColor2}',
      preserveColors: ${settings.preserveColors},
      animationSpeed: ${settings.animationSpeed},
      mouseInteraction: ${settings.mouseInteraction},
      sandEffect: ${settings.sandEffect},
      sandStrength: ${settings.sandStrength},
      sandReturn: ${settings.sandReturn},
      repelEffect: ${settings.repelEffect},
      interactionRadius: ${settings.interactionRadius},
      interactionStrength: ${settings.interactionStrength},
      noiseMovement: ${settings.noiseMovement},
      noiseScale: ${settings.noiseScale},
      includeStrokes: ${settings.includeStrokes},
      strokeWidth: ${settings.strokeWidth},
      strokeDetail: ${settings.strokeDetail},
      svgScale: ${settings.svgScale},
      svgDepth: ${settings.svgDepth}
    };
    
    // Create a DOMParser to parse the SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    
    // Create canvas to draw SVG
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = 2000;
    canvas.height = 2000;
    
    // Create Image from SVG
    const img = new Image();
    const svgBlob = new Blob([svgString], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = function() {
      // Calculate aspect ratio to fit SVG in canvas
      const svgRatio = img.width / img.height;
      let drawWidth, drawHeight, offsetX, offsetY;
      
      if (svgRatio > 1) {
        drawWidth = canvas.width * 0.8;
        drawHeight = drawWidth / svgRatio;
        offsetX = canvas.width * 0.1;
        offsetY = (canvas.height - drawHeight) / 2;
      } else {
        drawHeight = canvas.height * 0.8;
        drawWidth = drawHeight * svgRatio;
        offsetX = (canvas.width - drawWidth) / 2;
        offsetY = canvas.height * 0.1;
      }
      
      // Draw SVG to canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      
      // Get image data to sample pixels
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Prepare for separate stroke sampling
      let points = [];
      let colors = [];
      let strokePoints = [];
      let strokeColors = [];
      let fillPoints = [];
      let fillColors = [];
      
      // Sample points where pixels have alpha > 0
      const samplingStep = settings.particleDensity * 2;
      
      for (let y = 0; y < canvas.height; y += samplingStep) {
        for (let x = 0; x < canvas.width; x += samplingStep) {
          const index = (y * canvas.width + x) * 4;
          if (data[index + 3] > 50) {
            // Create point
            const depthFactor = Math.random();
            const z = settings.svgDepth > 0 ? (depthFactor - 0.5) * 2 * settings.svgDepth : 0;
            const point = new THREE.Vector3(
              (x - canvas.width / 2) * 0.1,
              -(y - canvas.height / 2) * 0.1,
              z
            );
            
            // Get color
            let color = null;
            if (settings.preserveColors) {
              color = \`rgb(\${data[index]}, \${data[index + 1]}, \${data[index + 2]})\`;
            }
            
            // Add to points
            points.push(point);
            colors.push(color);
            fillPoints.push(point);
            fillColors.push(color);
          }
        }
      }
      
      // If stroke detection is enabled
      if (settings.includeStrokes) {
        // Edge detection logic for strokes
        const edgeCanvas = document.createElement('canvas');
        const edgeCtx = edgeCanvas.getContext('2d');
        edgeCanvas.width = canvas.width;
        edgeCanvas.height = canvas.height;
        
        edgeCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        const edgeData = edgeCtx.getImageData(0, 0, canvas.width, canvas.height);
        const edgePixels = edgeData.data;
        
        const edgeSamplingStep = Math.max(1, samplingStep / settings.strokeDetail);
        
        for (let y = edgeSamplingStep; y < canvas.height - edgeSamplingStep; y += edgeSamplingStep) {
          for (let x = edgeSamplingStep; x < canvas.width - edgeSamplingStep; x += edgeSamplingStep) {
            const index = (y * canvas.width + x) * 4;
            
            if (edgePixels[index + 3] < 50) continue;
            
            // Check if it's an edge
            const isEdge = checkIfEdge(edgePixels, x, y, canvas.width);
            
            if (isEdge) {
              const depthFactor = Math.random();
              const z = settings.svgDepth > 0 ? (depthFactor - 0.5) * 2 * settings.svgDepth : 0;
              const point = new THREE.Vector3(
                (x - canvas.width / 2) * 0.1,
                -(y - canvas.height / 2) * 0.1,
                z
              );
              
              let color = null;
              if (settings.preserveColors) {
                color = \`rgb(\${edgePixels[index]}, \${edgePixels[index + 1]}, \${edgePixels[index + 2]})\`;
              }
              
              points.push(point);
              colors.push(color);
              strokePoints.push(point);
              strokeColors.push(color);
            }
          }
        }
      }
      
      // Edge detection helper
      function checkIfEdge(data, x, y, width) {
        const center = (y * width + x) * 4;
        
        if (data[center + 3] < 50) return false;
        
        const offsets = [
          [-1, -1], [0, -1], [1, -1],
          [-1,  0],          [1,  0],
          [-1,  1], [0,  1], [1,  1]
        ];
        
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          const neighborIndex = (ny * width + nx) * 4;
          
          if (data[neighborIndex + 3] < 50) {
            return true; // It's an edge pixel
          }
        }
        
        return false;
      }
      
      // Create particles
      createParticles(
        layer, 
        points, 
        strokePoints, 
        fillPoints, 
        settings, 
        colors, 
        strokeColors, 
        fillColors
      );
      
      // Clean up
      URL.revokeObjectURL(url);
    };
    
    img.src = url;
  }
  
  // Create particles for a layer
  function createParticles(layer, points, strokePoints, fillPoints, settings, colors, strokeColors, fillColors) {
    // Sample points
    let sampledPoints = samplePoints(points, strokePoints, fillPoints, settings.particleCount, colors, strokeColors, fillColors);
    
    // Create particles
    if (layer.useInstanced && points.length > 500) {
      createInstancedParticles(layer, sampledPoints, settings);
    } else {
      createTraditionalParticles(layer, sampledPoints, settings);
    }
    
    // Apply scale
    layer.group.scale.set(settings.svgScale, settings.svgScale, settings.svgScale);
  }
  
  // Sample points for particle creation
  function samplePoints(points, strokePoints, fillPoints, targetCount, colors, strokeColors, fillColors) {
    let result = [];
    
    if (points.length <= targetCount) {
      // Use all points
      points.forEach((point, index) => {
        result.push({
          point: point,
          isStroke: strokePoints.includes(point),
          color: colors ? colors[index] : null
        });
      });
    } else {
      // Calculate proportions
      const strokeRatio = strokePoints.length / points.length;
      const strokeCount = Math.floor(targetCount * strokeRatio);
      const fillCount = targetCount - strokeCount;
      
      // Sample stroke points
      if (strokePoints.length > 0) {
        const strokeIndices = new Set();
        while (strokeIndices.size < Math.min(strokeCount, strokePoints.length)) {
          strokeIndices.add(Math.floor(Math.random() * strokePoints.length));
        }
        
        for (const index of strokeIndices) {
          result.push({
            point: strokePoints[index],
            isStroke: true,
            color: strokeColors ? strokeColors[index] : null
          });
        }
      }
      
      // Sample fill points
      if (fillPoints.length > 0) {
        const fillIndices = new Set();
        while (fillIndices.size < Math.min(fillCount, fillPoints.length)) {
          fillIndices.add(Math.floor(Math.random() * fillPoints.length));
        }
        
        for (const index of fillIndices) {
          result.push({
            point: fillPoints[index],
            isStroke: false,
            color: fillColors ? fillColors[index] : null
          });
        }
      }
    }
    
    return result;
  }
  
  // Create instanced particles
  function createInstancedParticles(layer, sampledPoints, settings) {
    // Group by color and type
    const groups = new Map();
    
    // Process points
    sampledPoints.forEach(data => {
      const isStroke = data.isStroke;
      let color;
      
      if (settings.preserveColors && data.color) {
        color = data.color;
      } else if (settings.useGradient) {
        const normalizedY = (data.point.y + 100) / 200;
        color = interpolateColor(settings.gradientColor1, settings.gradientColor2, normalizedY);
      } else {
        color = isStroke ? tintColor(settings.color, 1.2) : settings.color;
      }
      
      // Get key for grouping
      const key = \`\${color}_\${isStroke ? 'stroke' : 'fill'}\`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(data);
    });
    
    // Create instanced meshes for each group
    const sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
    
    groups.forEach((particles, key) => {
      // Create material
      const [colorStr, type] = key.split('_');
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorStr),
        transparent: true,
        opacity: type === 'stroke' ? 0.9 : 0.8
      });
      
      // Create instanced mesh
      const instancedMesh = new THREE.InstancedMesh(sphereGeometry, material, particles.length);
      instancedMesh.frustumCulled = false;
      
      // Set matrices
      particles.forEach((data, i) => {
        const { point } = data;
        const sizeFactor = data.isStroke ? 0.8 : 1.0;
        const size = (settings.minSize + Math.random() * (settings.maxSize - settings.minSize)) * sizeFactor;
        
        const matrix = new THREE.Matrix4();
        matrix.makeTranslation(point.x, point.y, point.z);
        matrix.scale(new THREE.Vector3(size, size, size));
        instancedMesh.setMatrixAt(i, matrix);
        
        // Store animation data
        data.index = i;
        data.mesh = instancedMesh;
        data.size = size;
        data.originalPosition = point.clone();
        data.angle = Math.random() * Math.PI * 2;
        data.speed = 0.05 + Math.random() * 0.05;
        data.amplitude = Math.random() * 2;
        data.offset = new THREE.Vector3();
        data.velocity = new THREE.Vector3();
        data.noiseOffset = {
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          z: Math.random() * 1000
        };
      });
      
      instancedMesh.instanceMatrix.needsUpdate = true;
      
      // Add to layer
      layer.group.add(instancedMesh);
    });
    
    // Store particles data
    layer.particles = Array.from(groups.values()).flat();
  }
  
  // Create traditional particles
  function createTraditionalParticles(layer, sampledPoints, settings) {
    // Geometry and materials
    const sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
    const materials = new Map();
    
    // Process points
    layer.particles = sampledPoints.map(data => {
      const { point, isStroke } = data;
      
      // Size
      const sizeFactor = isStroke ? 0.8 : 1.0;
      const size = (settings.minSize + Math.random() * (settings.maxSize - settings.minSize)) * sizeFactor;
      
      // Color
      let color;
      if (settings.preserveColors && data.color) {
        color = data.color;
      } else if (settings.useGradient) {
        const normalizedY = (point.y + 100) / 200;
        color = interpolateColor(settings.gradientColor1, settings.gradientColor2, normalizedY);
      } else {
        color = isStroke ? tintColor(settings.color, 1.2) : settings.color;
      }
      
      // Get or create material
      const materialKey = \`\${color}_\${isStroke ? 'stroke' : 'fill'}\`;
      if (!materials.has(materialKey)) {
        materials.set(materialKey, new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: isStroke ? 0.9 : 0.8
        }));
      }
      
      // Create mesh
      const mesh = new THREE.Mesh(sphereGeometry, materials.get(materialKey));
      mesh.position.copy(point);
      mesh.scale.set(size, size, size);
      
      // Store data for animation
      data.mesh = mesh;
      data.size = size;
      data.originalPosition = point.clone();
      data.angle = Math.random() * Math.PI * 2;
      data.speed = 0.05 + Math.random() * 0.05;
      data.amplitude = Math.random() * 2;
      data.offset = new THREE.Vector3();
      data.velocity = new THREE.Vector3();
      data.noiseOffset = {
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        z: Math.random() * 1000
      };
      
      // Add to layer
      layer.group.add(mesh);
      
      return data;
    });
  }
  
  // Animation update
  function updateParticlesAnimation() {
    const time = performance.now() * 0.001 * ${settings.animationSpeed} * 0.5;
    
    // Animation settings
    const settings = {
      noiseMovement: ${settings.noiseMovement},
      noiseScale: ${settings.noiseScale},
      mouseInteraction: ${settings.mouseInteraction},
      repelEffect: ${settings.repelEffect},
      interactionRadius: ${settings.interactionRadius},
      interactionStrength: ${settings.interactionStrength},
      sandEffect: ${settings.sandEffect},
      sandStrength: ${settings.sandStrength},
      sandReturn: ${settings.sandReturn},
      svgDepth: ${settings.svgDepth},
      animationSpeed: ${settings.animationSpeed}
    };
    
    // Update all visible layers
    layers.forEach(layer => {
      if (!layer.visible) return;
      
      // Update particles in this layer
      layer.particles.forEach(particle => {
        updateParticle(particle, time, settings);
      });
    });
  }
  
  // Update a single particle
  function updateParticle(particle, time, settings) {
    const { mesh, originalPosition, isStroke, noiseOffset } = particle;
    
    // Skip if mesh doesn't exist
    if (!mesh) return;
    
    // For instanced meshes
    if (mesh instanceof THREE.InstancedMesh) {
      updateInstancedParticle(particle, time, settings);
      return;
    }
    
    // For regular meshes
    const currentPosition = mesh.position.clone();
    let newPosition = originalPosition.clone();
    
    // Apply animation
    if (settings.noiseMovement) {
      // Update noise offsets
      particle.noiseOffset.x += 0.002 * settings.animationSpeed;
      particle.noiseOffset.y += 0.002 * settings.animationSpeed;
      particle.noiseOffset.z += 0.002 * settings.animationSpeed;
      
      // Get 3D noise
      const noiseX = simplex.noise3D(
        particle.noiseOffset.x, 
        particle.noiseOffset.y, 
        0
      ) * settings.noiseScale * 100;
      
      const noiseY = simplex.noise3D(
        particle.noiseOffset.y, 
        particle.noiseOffset.z, 
        0
      ) * settings.noiseScale * 100;
      
      const noiseZ = simplex.noise3D(
        particle.noiseOffset.z, 
        particle.noiseOffset.x, 
        0
      ) * settings.noiseScale * 50;
      
      // Apply noise
      particle.offset.set(
        noiseX,
        noiseY,
        noiseZ * (settings.svgDepth > 0 ? 1 : 0)
      );
      
      newPosition.add(particle.offset);
    } else {
      // Sine wave animation
      particle.angle += particle.speed * settings.animationSpeed;
      
      particle.offset.x = Math.sin(particle.angle + time) * particle.amplitude;
      particle.offset.y = Math.cos(particle.angle + time * 1.5) * particle.amplitude;
      
      if (settings.svgDepth > 0) {
        particle.offset.z = Math.sin(particle.angle + time * 0.7) * particle.amplitude * 0.5;
      }
      
      newPosition.add(particle.offset);
    }
    
    // Strokes move more
    if (isStroke) {
      particle.offset.multiplyScalar(1.2);
    }
    
    // Mouse interaction
    if (settings.mouseInteraction && mouseMoved && mousePosition.length() > 0) {
      const distanceToMouse = mesh.position.distanceTo(mousePosition);
      const scale = mesh.parent ? mesh.parent.scale.x : 1;
      
      if (distanceToMouse < settings.interactionRadius * scale) {
        const forceFactor = (settings.interactionRadius * scale - distanceToMouse) / (settings.interactionRadius * scale);
        const force = settings.interactionStrength * forceFactor;
        
        const forceDirection = new THREE.Vector3()
          .subVectors(mesh.position, mousePosition)
          .normalize()
          .multiplyScalar(force);
        
        if (settings.repelEffect) {
          newPosition.add(forceDirection);
        } else {
          newPosition.sub(forceDirection);
        }
        
        // Sand effect
        if (settings.sandEffect) {
          if (settings.repelEffect) {
            particle.velocity.add(forceDirection.multiplyScalar(settings.sandStrength * 0.1));
          } else {
            particle.velocity.sub(forceDirection.multiplyScalar(settings.sandStrength * 0.1));
          }
        }
      }
    }
    
    // Sand physics
    if (settings.sandEffect) {
      const targetPosition = originalPosition.clone().add(particle.offset);
      const direction = targetPosition.clone().sub(currentPosition);
      
      const returnForce = direction.multiplyScalar(0.05 * settings.sandReturn);
      particle.velocity.add(returnForce);
      
      particle.velocity.multiplyScalar(0.95);
      
      newPosition = currentPosition.clone().add(particle.velocity);
    }
    
    // Update position
    mesh.position.copy(newPosition);
    
    // Add rotation
    mesh.rotation.x += 0.01 * settings.animationSpeed;
    mesh.rotation.y += 0.01 * settings.animationSpeed;
  }
  
  // Update an instanced particle
  function updateInstancedParticle(particle, time, settings) {
    const { mesh, originalPosition, index } = particle;
    
    // Get current matrix
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    
    // Extract current position and scale
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, rotation, scale);
    
    // Calculate new position
    let newPosition = originalPosition.clone();
    
    // Apply animation
    if (settings.noiseMovement) {
      // Update noise offsets
      particle.noiseOffset.x += 0.002 * settings.animationSpeed;
      particle.noiseOffset.y += 0.002 * settings.animationSpeed;
      particle.noiseOffset.z += 0.002 * settings.animationSpeed;
      
      // Get 3D noise
      const noiseX = simplex.noise3D(
        particle.noiseOffset.x, 
        particle.noiseOffset.y, 
        0
      ) * settings.noiseScale * 100;
      
      const noiseY = simplex.noise3D(
        particle.noiseOffset.y, 
        particle.noiseOffset.z, 
        0
      ) * settings.noiseScale * 100;
      
      const noiseZ = simplex.noise3D(
        particle.noiseOffset.z, 
        particle.noiseOffset.x, 
        0
      ) * settings.noiseScale * 50;
      
      // Apply noise
      particle.offset.set(
        noiseX,
        noiseY,
        noiseZ * (settings.svgDepth > 0 ? 1 : 0)
      );
      
      newPosition.add(particle.offset);
    } else {
      // Sine wave animation
      particle.angle += particle.speed * settings.animationSpeed;
      
      particle.offset.x = Math.sin(particle.angle + time) * particle.amplitude;
      particle.offset.y = Math.cos(particle.angle + time * 1.5) * particle.amplitude;
      
      if (settings.svgDepth > 0) {
        particle.offset.z = Math.sin(particle.angle + time * 0.7) * particle.amplitude * 0.5;
      }
      
      newPosition.add(particle.offset);
    }
    
    // Strokes move more
    if (particle.isStroke) {
      particle.offset.multiplyScalar(1.2);
    }
    
    // Mouse interaction
    if (settings.mouseInteraction && mouseMoved && mousePosition.length() > 0) {
      const distanceToMouse = position.distanceTo(mousePosition);
      const parentScale = mesh.parent ? mesh.parent.scale.x : 1;
      
      if (distanceToMouse < settings.interactionRadius * parentScale) {
        const forceFactor = (settings.interactionRadius * parentScale - distanceToMouse) / (settings.interactionRadius * parentScale);
        const force = settings.interactionStrength * forceFactor;
        
        const forceDirection = new THREE.Vector3()
          .subVectors(position, mousePosition)
          .normalize()
          .multiplyScalar(force);
        
        if (settings.repelEffect) {
          newPosition.add(forceDirection);
        } else {
          newPosition.sub(forceDirection);
        }
        
        // Sand effect
        if (settings.sandEffect) {
          if (settings.repelEffect) {
            particle.velocity.add(forceDirection.multiplyScalar(settings.sandStrength * 0.1));
          } else {
            particle.velocity.sub(forceDirection.multiplyScalar(settings.sandStrength * 0.1));
          }
        }
      }
    }
    
    // Sand physics
    if (settings.sandEffect) {
      const targetPosition = originalPosition.clone().add(particle.offset);
      const direction = targetPosition.clone().sub(position);
      
      const returnForce = direction.multiplyScalar(0.05 * settings.sandReturn);
      particle.velocity.add(returnForce);
      
      particle.velocity.multiplyScalar(0.95);
      
      newPosition = position.clone().add(particle.velocity);
    }
    
    // Create new matrix
    const newMatrix = new THREE.Matrix4();
    newMatrix.makeTranslation(newPosition.x, newPosition.y, newPosition.z);
    
    // Add rotation
    const rotX = new THREE.Matrix4().makeRotationX(0.01 * settings.animationSpeed);
    const rotY = new THREE.Matrix4().makeRotationY(0.01 * settings.animationSpeed);
    newMatrix.multiply(rotX).multiply(rotY);
    
    // Apply scale
    newMatrix.scale(scale);
    
    // Update instance matrix
    mesh.setMatrixAt(index, newMatrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
  
  // Helper for color interpolation
  function interpolateColor(color1, color2, factor) {
    const c1 = new THREE.Color(color1);
    const c2 = new THREE.Color(color2);
    return new THREE.Color().lerpColors(c1, c2, factor).getStyle();
  }
  
  // Helper to tint a color
  function tintColor(color, factor) {
    const c = new THREE.Color(color).multiplyScalar(factor);
    return c.getStyle();
  }
  
  // Return public API
  return {
    init: init,
    addSVGLayer: addSVGLayer
  };
})();

// Example usage:
// 1. Initialize the particle system
document.addEventListener('DOMContentLoaded', function() {
  ParticleSystem.init('your-container-id');
  
  // 2. Add SVG layers
  const svgData = \`${
    state.layers.length > 0 
    ? state.layers[0].svgString?.replace(/\\/g, '\\\\').replace(/\`/g, '\\`').substring(0, 500) + '...'
    : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="white" stroke-width="2"/></svg>'
  }\`;
  
  ParticleSystem.addSVGLayer(svgData, 'Example Layer');
});`;
      
      // Set the code in the code element
      if (dom.codeEl) {
        dom.codeEl.textContent = code;
      }
      
      return code;
    } catch (e) {
      console.error("Error generating code:", e);
      if (dom.codeEl) {
        dom.codeEl.textContent = "// Error generating code. Please try again.";
      }
      showNotification("Error generating code", "error");
      return "";
    }
  }

  /**
   * Interpolate between two colors
   */
  function interpolateColors(color1, color2, factor) {
    const c1 = new THREE.Color(color1);
    const c2 = new THREE.Color(color2);
    return new THREE.Color().lerpColors(c1, c2, factor).getStyle();
  }

  /**
   * Tint a color by multiplying its luminance
   */
  function tintColor(color, factor) {
    return new THREE.Color(color).multiplyScalar(factor).getStyle();
  }

  /**
   * Export the current particle system as a screenshot
   */
  function takeScreenshot() {
    try {
      // Temporarily remove UI elements
      const footer = document.querySelector('.footer');
      const canvasControls = document.querySelector('.canvas-controls');
      const stats = document.querySelector('.performance-stats');
      
      if (footer) footer.style.display = 'none';
      if (canvasControls) canvasControls.style.display = 'none';
      if (stats) stats.style.display = 'none';
      
      // Render the scene with current settings
      const glowEffectEl = document.getElementById('glow-effect');
      if (glowEffectEl && glowEffectEl.checked && state.composer) {
        state.composer.render();
      } else {
        state.renderer.render(state.scene, state.camera);
      }
      
      // Get the data URL of the canvas
      const imageData = state.renderer.domElement.toDataURL('image/png');
      
      // Create a download link
      const link = document.createElement('a');
      link.href = imageData;
      link.download = 'partycle-export.png';
      document.body.appendChild(link);
      
      // Trigger the download
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      
      // Restore UI elements
      if (footer) footer.style.display = '';
      if (canvasControls) canvasControls.style.display = '';
      if (stats) stats.style.display = '';
      
      // Show notification
      showNotification("Screenshot saved!", "success");
    } catch (e) {
      console.error("Error taking screenshot:", e);
      showNotification("Error taking screenshot", "error");
    }
  }

  /**
   * Export the current animation as a GIF
   */
  function exportGif() {
    try {
      showNotification("Starting GIF capture... This may take a moment", "info");
      
      // Temporarily disable certain UI elements
      const footer = document.querySelector('.footer');
      const canvasControls = document.querySelector('.canvas-controls');
      const stats = document.querySelector('.performance-stats');
      
      if (footer) footer.style.display = 'none';
      if (canvasControls) canvasControls.style.display = 'none';
      if (stats) stats.style.display = 'none';
      
      // Setup GIF recorder with GIF.js
      // This assumes you've included GIF.js in your HTML
      if (typeof GIF === 'undefined') {
        // Load GIF.js dynamically if not already included
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js';
        script.onload = () => startGifCapture();
        document.head.appendChild(script);
      } else {
        startGifCapture();
      }
      
      function startGifCapture() {
        const gif = new GIF({
          workers: 4,
          quality: 10,
          width: 800,
          height: 600,
          workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
        });
        
        // Add frame callback
        let frames = 0;
        const maxFrames = 60; // 2 seconds at 30fps
        
        function captureFrame() {
          // Render frame
          if (document.getElementById('glow-effect').checked) {
            state.composer.render();
          } else {
            state.renderer.render(state.scene, state.camera);
          }
          
          // Add to GIF
          gif.addFrame(state.renderer.domElement, { copy: true, delay: 33 });
          
          frames++;
          
          // Continue capturing or finish
          if (frames < maxFrames) {
            requestAnimationFrame(captureFrame);
          } else {
            // Finish GIF
            showNotification("Rendering GIF...", "info");
            
            gif.on('finished', function(blob) {
              // Create download link
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'partycle-animation.gif';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              // Cleanup
              URL.revokeObjectURL(url);
              
              // Restore UI elements
              if (footer) footer.style.display = '';
              if (canvasControls) canvasControls.style.display = '';
              if (stats) stats.style.display = '';
              
              showNotification("GIF saved!", "success");
            });
            
            gif.render();
          }
        }
        
        // Start capture
        captureFrame();
      }
    } catch (e) {
      console.error("Error exporting GIF:", e);
      showNotification("Error exporting GIF", "error");
      
      // Restore UI elements
      const footer = document.querySelector('.footer');
      const canvasControls = document.querySelector('.canvas-controls');
      const stats = document.querySelector('.performance-stats');
      
      if (footer) footer.style.display = '';
      if (canvasControls) canvasControls.style.display = '';
      if (stats) stats.style.display = '';
    }
  }

  /**
   * Apply a color theme to particles
   */
  function applyColorTheme(theme) {
    try {
      let colors;
      
      switch(theme) {
        case 'sunset':
          colors = {
            primary: '#ff7e5f',
            secondary: '#feb47b'
          };
          break;
        case 'ocean':
          colors = {
            primary: '#2193b0',
            secondary: '#6dd5ed'
          };
          break;
        case 'forest':
          colors = {
            primary: '#5adb94',
            secondary: '#2bde73'
          };
          break;
        case 'purple':
          colors = {
            primary: '#8e44ad',
            secondary: '#9b59b6'
          };
          break;
        default: // Default theme
          colors = {
            primary: '#6366f1',
            secondary: '#ec4899'
          };
      }
      
      // Apply colors to UI
      const gradientColor1El = document.getElementById('gradient-color1');
      const gradientColor2El = document.getElementById('gradient-color2');
      const useGradientEl = document.getElementById('use-gradient');
      
      if (gradientColor1El) gradientColor1El.value = colors.primary;
      if (gradientColor2El) gradientColor2El.value = colors.secondary;
      
      // Make sure gradient is enabled
      if (useGradientEl) useGradientEl.checked = true;
      if (dom.solidColorControl) dom.solidColorControl.style.display = 'none';
      if (dom.gradientControls) dom.gradientControls.style.display = 'block';
      
      // Update particles
      updateAllLayers();
      
      showNotification(`Applied ${theme} theme`, "success");
    } catch (e) {
      console.error("Error applying color theme:", e);
      showNotification("Error applying theme", "error");
    }
  }

  /**
   * Load user presets from localStorage
   */
  function loadUserPresets() {
    try {
      const presets = localStorage.getItem('particlePresets');
      if (presets) {
        state.userPresets = JSON.parse(presets);
        updatePresetsDropdown();
      }
    } catch (e) {
      console.error("Error loading presets:", e);
    }
  }

  /**
   * Update presets dropdown with user presets
   */
  function updatePresetsDropdown() {
    if (!dom.presetSelector) return;
    
    // Remove existing user presets
    Array.from(dom.presetSelector.children).forEach(option => {
      if (option.value && !['', 'dynamic-logo', 'flowing-text', 'organic-shape', 'sci-fi', 'minimal'].includes(option.value)) {
        option.remove();
      }
    });
    
    // Add user presets
    if (state.userPresets) {
      const fragment = document.createDocumentFragment();
      
      // Add separator if we have user presets
      if (Object.keys(state.userPresets).length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '───────────────';
        fragment.appendChild(separator);
      }
      
      // Add each preset
      Object.entries(state.userPresets).forEach(([presetId, preset]) => {
        const option = document.createElement('option');
        option.value = presetId;
        option.textContent = preset.name;
        fragment.appendChild(option);
      });
      
      dom.presetSelector.appendChild(fragment);
    }
  }

  /**
   * Apply a preset from the dropdown
   */
  function applySelectedPreset() {
    if (!dom.presetSelector) return;
    
    const presetId = dom.presetSelector.value;
    if (!presetId) return;
    
    // Check if it's a built-in preset
    if (['dynamic-logo', 'flowing-text', 'organic-shape', 'sci-fi', 'minimal'].includes(presetId)) {
      applyBuiltInPreset(presetId);
    } else if (state.userPresets && state.userPresets[presetId]) {
      // Apply user preset
      const preset = state.userPresets[presetId];
      applySettings(preset.settings);
      showNotification(`Applied preset: ${preset.name}`, "success");
    }
  }

  /**
   * Apply one of the built-in presets
   */
  function applyBuiltInPreset(presetId) {
    try {
      let settings;
      
      switch(presetId) {
        case 'dynamic-logo':
          settings = {
            particleCount: 2000,
            particleDensity: 3,
            minSize: 0.7,
            maxSize: 1.6,
            color: '#6366f1',
            useGradient: true,
            gradientColor1: '#6366f1',
            gradientColor2: '#ec4899',
            preserveColors: false,
            animationSpeed: 1.2,
            mouseInteraction: true,
            sandEffect: false,
            repelEffect: false,
            interactionRadius: 100,
            interactionStrength: 5,
            interactionSensitivity: 7,
            glowEffect: true,
            bloomStrength: 1.1,
            bloomRadius: 0.7,
            bloomThreshold: 0.7,
            noiseMovement: true,
            noiseScale: 0.025,
            includeStrokes: true,
            strokeWidth: 3,
            strokeDetail: 8,
            enableOrbit: true,
            svgScale: 1.2,
            svgDepth: 30,
            useInstanced: true
          };
          break;
          
        case 'flowing-text':
          settings = {
            particleCount: 3000,
            particleDensity: 2,
            minSize: 0.3,
            maxSize: 1.0,
            color: '#2193b0',
            useGradient: true,
            gradientColor1: '#2193b0',
            gradientColor2: '#6dd5ed',
            preserveColors: false,
            animationSpeed: 0.8,
            mouseInteraction: true,
            sandEffect: true,
            sandStrength: 6,
            sandReturn: 0.7,
            repelEffect: true,
            interactionRadius: 70,
            interactionStrength: 4,
            interactionSensitivity: 8,
            glowEffect: true,
            bloomStrength: 0.7,
            bloomRadius: 0.3,
            bloomThreshold: 0.8,
            noiseMovement: true,
            noiseScale: 0.015,
            includeStrokes: true,
            strokeWidth: 1,
            strokeDetail: 7,
            enableOrbit: true,
            svgScale: 1.0,
            svgDepth: 15,
            useInstanced: true
          };
          break;
          
        case 'organic-shape':
          settings = {
            particleCount: 4000,
            particleDensity: 3,
            minSize: 0.3,
            maxSize: 2.0,
            color: '#5adb94',
            useGradient: true,
            gradientColor1: '#5adb94',
            gradientColor2: '#2bde73',
            preserveColors: false,
            animationSpeed: 0.5,
            mouseInteraction: true,
            sandEffect: false,
            repelEffect: false,
            interactionRadius: 120,
            interactionStrength: 2,
            interactionSensitivity: 5,
            glowEffect: true,
            bloomStrength: 0.8,
            bloomRadius: 0.5,
            bloomThreshold: 0.8,
            noiseMovement: true,
            noiseScale: 0.03,
            includeStrokes: false,
            strokeWidth: 2,
            strokeDetail: 5,
            enableOrbit: true,
            svgScale: 1.5,
            svgDepth: 50,
            useInstanced: true
          };
          break;
          
        case 'sci-fi':
          settings = {
            particleCount: 5000,
            particleDensity: 5,
            minSize: 0.2,
            maxSize: 1.0,
            color: '#8e44ad',
            useGradient: true,
            gradientColor1: '#8e44ad',
            gradientColor2: '#9b59b6',
            preserveColors: false,
            animationSpeed: 1.5,
            mouseInteraction: true,
            sandEffect: false,
            repelEffect: true,
            interactionRadius: 150,
            interactionStrength: 7,
            interactionSensitivity: 9,
            glowEffect: true,
            bloomStrength: 1.5,
            bloomRadius: 0.6,
            bloomThreshold: 0.6,
            noiseMovement: false,
            noiseScale: 0.01,
            includeStrokes: true,
            strokeWidth: 4,
            strokeDetail: 9,
            enableOrbit: true,
            svgScale: 0.9,
            svgDepth: 70,
            useInstanced: true
          };
          break;
          
        case 'minimal':
          settings = {
            particleCount: 1000,
            particleDensity: 6,
            minSize: 0.5,
            maxSize: 0.8,
            color: '#ffffff',
            useGradient: false,
            gradientColor1: '#ffffff',
            gradientColor2: '#cccccc',
            preserveColors: false,
            animationSpeed: 0.3,
            mouseInteraction: true,
            sandEffect: false,
            repelEffect: false,
            interactionRadius: 50,
            interactionStrength: 1.5,
            interactionSensitivity: 3,
            glowEffect: false,
            bloomStrength: 0.5,
            bloomRadius: 0.2,
            bloomThreshold: 0.9,
            noiseMovement: false,
            noiseScale: 0.005,
            includeStrokes: true,
            strokeWidth: 1,
            strokeDetail: 3,
            enableOrbit: true,
            svgScale: 1.0,
            svgDepth: 5,
            useInstanced: true
          };
          break;
          
        default:
          showNotification("Unknown preset", "error");
          return;
      }
      
      // Apply settings
      applySettings(settings);
      showNotification(`Applied preset: ${presetId}`, "success");
    } catch (e) {
      console.error("Error applying preset:", e);
      showNotification("Error applying preset", "error");
    }
  }

  /**
   * Save current settings as a user preset
   */
  function saveCurrentPreset() {
    try {
      const name = dom.presetNameInput.value.trim();
      const description = dom.presetDescriptionInput.value.trim();
      
      if (!name) {
        showNotification("Please enter a preset name", "warning");
        return;
      }
      
      // Create preset ID
      const presetId = `user_${Date.now()}`;
      
      // Get current settings
      const settings = getSettings();
      
      // Create preset object
      const preset = {
        id: presetId,
        name: name,
        description: description,
        settings: settings,
        created: new Date().toISOString()
      };
      
      // Add to user presets
      if (!state.userPresets) state.userPresets = {};
      state.userPresets[presetId] = preset;
      
      // Save to localStorage
      localStorage.setItem('particlePresets', JSON.stringify(state.userPresets));
      
      // Update dropdown
      updatePresetsDropdown();
      
      // Select the new preset
      if (dom.presetSelector) {
        dom.presetSelector.value = presetId;
      }
      
      // Close modal
      dom.presetModal.classList.remove('active');
      
      // Clear inputs
      dom.presetNameInput.value = '';
      dom.presetDescriptionInput.value = '';
      
      showNotification(`Preset "${name}" saved successfully`, "success");
    } catch (e) {
      console.error("Error saving preset:", e);
      showNotification("Error saving preset", "error");
    }
  }

  /**
   * Delete the selected preset
   */
  function deleteSelectedPreset() {
    try {
      const presetId = dom.presetSelector.value;
      
      if (!presetId || !presetId.startsWith('user_')) {
        showNotification("Cannot delete built-in presets", "warning");
        return;
      }
      
      if (state.userPresets && state.userPresets[presetId]) {
        const presetName = state.userPresets[presetId].name;
        
        // Ask for confirmation
        if (confirm(`Are you sure you want to delete the preset "${presetName}"?`)) {
          // Delete the preset
          delete state.userPresets[presetId];
          
          // Save to localStorage
          localStorage.setItem('particlePresets', JSON.stringify(state.userPresets));
          
          // Update dropdown
          updatePresetsDropdown();
          
          // Clear selection
          dom.presetSelector.value = '';
          
          showNotification(`Preset "${presetName}" deleted`, "success");
        }
      } else {
        showNotification("Preset not found", "error");
      }
    } catch (e) {
      console.error("Error deleting preset:", e);
      showNotification("Error deleting preset", "error");
    }
  }

  /**
   * Show a notification message to the user
   */
  function showNotification(message, type = 'success') {
    if (!dom.notification) return;
    
    // Set notification content
    dom.notification.textContent = message;
    
    // Set notification type
    dom.notification.className = 'notification';
    dom.notification.classList.add(`notification-${type}`);
    
    // Set border color based on type
    switch (type) {
      case 'success':
        dom.notification.style.borderLeftColor = 'var(--success)';
        break;
      case 'warning':
        dom.notification.style.borderLeftColor = 'var(--warning)';
        break;
      case 'error':
        dom.notification.style.borderLeftColor = 'var(--danger)';
        break;
      case 'info':
      default:
        dom.notification.style.borderLeftColor = 'var(--primary)';
        break;
    }
    
    // Show notification
    dom.notification.classList.add('active');
    
    // Hide after a delay
    setTimeout(() => {
      dom.notification.classList.remove('active');
    }, 3000);
  }

  /**
   * Properly dispose of all Three.js resources
   */
  function dispose() {
    try {
      // Dispose of all layers
      state.layers.forEach(layer => {
        clearLayerParticles(layer);
        if (layer.group) {
          state.scene.remove(layer.group);
        }
      });
      
      // Clear layers array
      state.layers = [];
      
      // Dispose of cached resources
      resourceCache.disposables.forEach(resource => {
        if (resource && typeof resource.dispose === 'function') {
          resource.dispose();
        }
      });
      
      // Clear disposables array
      resourceCache.disposables = [];
      
      // Clear material cache
      resourceCache.materialCache.clear();
      
      // Dispose of renderer and composer
      if (state.renderer) {
        state.renderer.dispose();
        state.renderer.domElement.remove();
      }
      
      if (state.composer) {
        state.composer.renderTarget1.dispose();
        state.composer.renderTarget2.dispose();
      }
      
      // Remove orbit controls
      if (state.controls) {
        state.controls.dispose();
      }
      
      // Clear camera and scene references
      state.camera = null;
      state.scene = null;
      state.renderer = null;
      state.controls = null;
      state.composer = null;
      state.bloomPass = null;
    } catch (e) {
      console.error("Error disposing resources:", e);
    }
  }

  // Exposed public API
  return {
    init,
    dispose,
    generateParticles: generateAllLayers,
    resetSettings,
    takeScreenshot,
    exportGif,
    exportCode: generateCode
  };
})();

// Initialize the application
document.addEventListener('DOMContentLoaded', ParticleApp.init);
