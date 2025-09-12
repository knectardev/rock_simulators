// UI elements
let rSlider, vertexSlider, gravitySlider, densitySlider, fillColorSlider, fillOpacitySlider, thicknessSlider, frictionSlider, obstacleDensitySlider, obstacleSpawnRateSlider, obstacleRepelSlider;
let rLabel, vertexLabel, gravityLabel, densityLabel, thicknessLabel, fillLabel, fillOpacityLabel, frictionLabel, obstacleDensityLabel, obstacleSpawnRateLabel, obstacleRepelLabel;
let circleColorPicker, squareColorPicker, triangleColorPicker;
let circleColorLabel, squareColorLabel, triangleColorLabel;
let uiPanel;
let fillCheckbox, rimCheckbox, wireCheckbox, pointsCheckbox, solidCheckbox, vectorCheckbox, trailCheckbox, centerDragCheckbox;
let BASE_NUM_POINTS;

let ADD_RANDOM_CROSS_SPRINGS = false;
let DRAW_ALL_INTERNAL_SPRINGS = false;
let DRAW_CENTER_SPRINGS = false;

let num_points = 80;
let thickness = 24;
let inner_radius = CANVAS_SIZE / 5;
let outer_radius = inner_radius + thickness;
let restOuterArea = 0;
let blobVisFx = 0;
let blobVisFy = 0;
let softBody = null;

function instantiateNewSoftBody(cx, cy) {
	// Preserve current vertex count and thickness settings
	let spawnX = (typeof cx === 'number') ? cx : width/2;
	let spawnY = (typeof cy === 'number') ? cy : height/2;
	let blob = new BlobInstance(inner_radius, outer_radius, num_points, spawnX, spawnY);
	blob.restOuterArea = blob.computeOuterArea();
	if (typeof blobs !== 'undefined') {
		blobs.push(blob);
	}
	draggingBlob = false;
	draggedPointIndex = -1;
	draggedBlobIndex = -1;
}

function setup() {
	frameRate(FRAME);
	createCanvas(windowWidth, windowHeight);
	textSize(15);
	uiPanel = createDiv('');
	uiPanel.position(8, 8);
	uiPanel.style('background', 'rgba(255,255,255,0.7)');
	uiPanel.style('border', '1px solid #000');
	uiPanel.style('padding', '8px');
	uiPanel.style('width', '360px');
	uiPanel.style('height', (windowHeight - 16) + 'px');
	uiPanel.style('overflow-y', 'auto');
	uiPanel.style('z-index', '0');

	// Even spacing for sliders
	const SLIDER_START_Y = 20;
	const SLIDER_GAP = 28;
	let _y = SLIDER_START_Y;

	rSlider = createSlider(0, 360, 300, 1);
	rSlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(rSlider);
	vertexSlider = createSlider(-1, 1, 0, 0.01);
	vertexSlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(vertexSlider);
	gravitySlider = createSlider(0.5, 5.0, 1.25, 0.01);
	gravitySlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(gravitySlider);
	densitySlider = createSlider(0.25, 2.0, 1.50, 0.01);
	densitySlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(densitySlider);
	thicknessSlider = createSlider(10, 50, constrain(thickness, 10, 50), 1);
	thicknessSlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(thicknessSlider);
	fillColorSlider = createSlider(0, 255, 0, 1);
	fillColorSlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(fillColorSlider);
	// INSERTED: fill opacity slider (0-100%, default 80%)
	fillOpacitySlider = createSlider(0, 100, 80, 1);
	fillOpacitySlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(fillOpacitySlider);
	frictionSlider = createSlider(0, 10, 6.0, 0.1);
	frictionSlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(frictionSlider);
	obstacleDensitySlider = createSlider(0.25, 4.0, 0.75, 0.01);
	obstacleDensitySlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(obstacleDensitySlider);

	// INSERTED: obstacle nucleation rate slider
	obstacleSpawnRateSlider = createSlider(0.0, 4.0, 3.0, 0.01);
	obstacleSpawnRateSlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(obstacleSpawnRateSlider);

	// INSERTED: obstacle repulsion strength slider (0.0x - 3.0x, default 1.0x)
	obstacleRepelSlider = createSlider(0.0, 3.0, 1.0, 0.01);
	obstacleRepelSlider.position(20, _y); _y += SLIDER_GAP;
	styleSlider(obstacleRepelSlider);

	// INSERTED: per-shape color pickers
	circleColorPicker = createColorPicker(CIRCLE_FILL_COLOR || '#ffffff');
	circleColorPicker.position(20, _y); _y += SLIDER_GAP;
	circleColorLabel = createDiv('circle color');
	styleLabel(circleColorLabel);
	circleColorLabel.position(circleColorPicker.x + circleColorPicker.width + 16, circleColorPicker.y - 4);

	squareColorPicker = createColorPicker(SQUARE_FILL_COLOR || '#4682B4');
	squareColorPicker.position(20, _y); _y += SLIDER_GAP;
	squareColorLabel = createDiv('square color');
	styleLabel(squareColorLabel);
	squareColorLabel.position(squareColorPicker.x + squareColorPicker.width + 16, squareColorPicker.y - 4);

	triangleColorPicker = createColorPicker(TRIANGLE_FILL_COLOR || '#90EE90');
	triangleColorPicker.position(20, _y); _y += SLIDER_GAP;
	triangleColorLabel = createDiv('triangle color');
	styleLabel(triangleColorLabel);
	triangleColorLabel.position(triangleColorPicker.x + triangleColorPicker.width + 16, triangleColorPicker.y - 4);

	rLabel = createDiv('bg hue');
	styleLabel(rLabel);
	rLabel.position(rSlider.x + rSlider.width + 16, rSlider.y - 4);
	vertexLabel = createDiv('vertices ' + num_points);
	styleLabel(vertexLabel);
	vertexLabel.position(vertexSlider.x + vertexSlider.width + 16, vertexSlider.y - 4);
	gravityLabel = createDiv('gravity 1.00x');
	styleLabel(gravityLabel);
	gravityLabel.position(gravitySlider.x + gravitySlider.width + 16, gravitySlider.y - 4);
	densityLabel = createDiv('density 1.00x');
	styleLabel(densityLabel);
	densityLabel.position(densitySlider.x + densitySlider.width + 16, densitySlider.y - 4);
	thicknessLabel = createDiv('rim thickness ' + Math.round(thickness) + 'px');
	styleLabel(thicknessLabel);
	thicknessLabel.position(thicknessSlider.x + thicknessSlider.width + 16, thicknessSlider.y - 4);
	fillLabel = createDiv('fill color');
	styleLabel(fillLabel);
	fillLabel.position(fillColorSlider.x + fillColorSlider.width + 16, fillColorSlider.y - 4);
	// INSERTED: fill opacity label
	fillOpacityLabel = createDiv('fill opacity 0.80');
	styleLabel(fillOpacityLabel);
	fillOpacityLabel.position(fillOpacitySlider.x + fillOpacitySlider.width + 16, fillOpacitySlider.y - 4);
	frictionLabel = createDiv('friction 0.00');
	styleLabel(frictionLabel);
	frictionLabel.position(frictionSlider.x + frictionSlider.width + 16, frictionSlider.y - 4);
	obstacleDensityLabel = createDiv('obstacle density 1.00x');
	styleLabel(obstacleDensityLabel);
	obstacleDensityLabel.position(obstacleDensitySlider.x + obstacleDensitySlider.width + 16, obstacleDensitySlider.y - 4);

	// INSERTED: nucleation rate label
	obstacleSpawnRateLabel = createDiv('nucleation 1.00x');
	styleLabel(obstacleSpawnRateLabel);
	obstacleSpawnRateLabel.position(obstacleSpawnRateSlider.x + obstacleSpawnRateSlider.width + 16, obstacleSpawnRateSlider.y - 4);

	// INSERTED: obstacle repulsion label
	obstacleRepelLabel = createDiv('repel 1.00x');
	styleLabel(obstacleRepelLabel);
	obstacleRepelLabel.position(obstacleRepelSlider.x + obstacleRepelSlider.width + 16, obstacleRepelSlider.y - 4);

	// Place checkboxes below the last slider to avoid overlap
	const CHECKBOX_GAP = 25;
	let checkboxY = _y + 12;
	fillCheckbox = createCheckbox('Display blob fill', false);
	fillCheckbox.position(20, checkboxY); checkboxY += CHECKBOX_GAP;
	styleCheckbox(fillCheckbox);
	rimCheckbox = createCheckbox('Display blob border rim', true);
	rimCheckbox.position(20, checkboxY); checkboxY += CHECKBOX_GAP;
	styleCheckbox(rimCheckbox);
	wireCheckbox = createCheckbox('Display blob wire-frame', false);
	wireCheckbox.position(20, checkboxY); checkboxY += CHECKBOX_GAP;
	styleCheckbox(wireCheckbox);
	pointsCheckbox = createCheckbox('Display mesh points', false);
	pointsCheckbox.position(20, checkboxY); checkboxY += CHECKBOX_GAP;
	styleCheckbox(pointsCheckbox);
	solidCheckbox = createCheckbox('Display blob solid interior', true);
	solidCheckbox.position(20, checkboxY); checkboxY += CHECKBOX_GAP;
	styleCheckbox(solidCheckbox);
	vectorCheckbox = createCheckbox('Display green force vectors', false);
	vectorCheckbox.position(20, checkboxY); checkboxY += CHECKBOX_GAP;
	styleCheckbox(vectorCheckbox);
	trailCheckbox = createCheckbox('Display obstacle trails', false);
	trailCheckbox.position(20, checkboxY); checkboxY += CHECKBOX_GAP;
	styleCheckbox(trailCheckbox);
	centerDragCheckbox = createCheckbox('Tug from blob center', true);
	centerDragCheckbox.position(20, checkboxY); checkboxY += CHECKBOX_GAP;
	styleCheckbox(centerDragCheckbox);

	// INSERTED: toggle blob splitting
	splitCheckbox = createCheckbox('Enable blob splitting', ENABLE_BLOB_SPLIT_ON_PENETRATION);
	splitCheckbox.position(20, checkboxY); checkboxY += CHECKBOX_GAP;
	styleCheckbox(splitCheckbox);

	BASE_NUM_POINTS = num_points;
	softBody = new SoftBody(inner_radius, outer_radius, num_points);
	softBody.initializeGeometry();
	obstacles = [
		spawnObstacleInView(),
		spawnObstacleInView(),
		spawnObstacleInView()
	];
	window.addEventListener('keydown', handleGlobalKeydown);
}

function draw() {
	const r = rSlider ? rSlider.value() : 255;
	const vertFactor = pow(2, vertexSlider ? vertexSlider.value() : 0);
	const targetVerts = max(4, Math.round(BASE_NUM_POINTS * vertFactor));
	if (targetVerts !== num_points) {
		try {
			softBody.rebuildVertexCount(targetVerts);
		} catch (e) {
			// Fallback: rebuild each blob defensively
			if (typeof blobs !== 'undefined' && blobs.length > 0) {
				for (var b = 0; b < blobs.length; b++) {
					let c = blobs[b].points[blobs[b].points.length - 1];
					blobs[b].vertexCount = targetVerts;
					blobs[b].build(c.x, c.y);
					blobs[b].restOuterArea = blobs[b].computeOuterArea();
				}
			}
		}
		num_points = targetVerts;
		// Freeze physics for a brief moment to settle forces
		window.__freezeFrames = REBUILD_FREEZE_FRAMES;
		draggingBlob = false;
		draggedPointIndex = -1;
		draggedBlobIndex = -1;
	}
	const g = 11;
	const gravScale = gravitySlider ? gravitySlider.value() : 1;
	const densityScale = densitySlider ? densitySlider.value() : 1;
	// Rainbow background using hue slider (HSB)
	push();
	colorMode(HSB, 360, 100, 100, 255);
	const hueVal = rSlider ? rSlider.value() : 200;
	background(hueVal, 80, 20);
	pop();
	BLOB_FILL_GRAY = fillColorSlider ? fillColorSlider.value() : 0;
	window.__blobFillAlpha = fillOpacitySlider ? Math.round(255 * (fillOpacitySlider.value() / 100)) : 204;
	const targetThickness = thicknessSlider ? thicknessSlider.value() : thickness;
	if (targetThickness !== thickness) {
		softBody.rebuildThickness(targetThickness);
		draggingBlob = false;
		draggedPointIndex = -1;
	}
	// Update obstacle repulsion parameters from UI slider each frame BEFORE physics
	if (typeof obstacleRepelSlider !== 'undefined') {
		let scale = obstacleRepelSlider.value();
		OBSTACLE_CONTACT_REPEL_K = OBSTACLE_CONTACT_REPEL_K_BASE * scale;
		OBSTACLE_MAX_PAIR_FORCE = OBSTACLE_MAX_PAIR_FORCE_BASE * max(0.2, scale);
	}
	// Update per-shape colors from pickers
	if (typeof circleColorPicker !== 'undefined') {
		CIRCLE_FILL_COLOR = circleColorPicker.value();
	}
	if (typeof squareColorPicker !== 'undefined') {
		SQUARE_FILL_COLOR = squareColorPicker.value();
	}
	if (typeof triangleColorPicker !== 'undefined') {
		TRIANGLE_FILL_COLOR = triangleColorPicker.value();
	}
	// INSERTED: wire blob splitting checkbox
	if (typeof splitCheckbox !== 'undefined' && typeof ENABLE_BLOB_SPLIT_ON_PENETRATION !== 'undefined') {
		ENABLE_BLOB_SPLIT_ON_PENETRATION = !!splitCheckbox.checked();
	}
	updatePhysics();
	// Update cursor based on drag state
	cursor(draggingBlob ? 'grabbing' : 'default');
	applyGlobalScroll();
	recycleObstacles();
	drawObjects();
	if (vertexLabel) vertexLabel.html('vertices ' + num_points);
	if (gravityLabel) gravityLabel.html('gravity ' + gravScale.toFixed(2) + 'x');
	if (densityLabel) densityLabel.html('density ' + getDensityScale().toFixed(2) + 'x');
	if (thicknessLabel) thicknessLabel.html('rim thickness ' + Math.round(thickness) + 'px');
	if (frictionLabel && frictionSlider) frictionLabel.html('friction ' + (frictionSlider.value() * 1.0).toFixed(2));
	if (obstacleDensityLabel && obstacleDensitySlider) obstacleDensityLabel.html('obstacle density ' + obstacleDensitySlider.value().toFixed(2) + 'x');
	if (fillOpacityLabel && fillOpacitySlider) fillOpacityLabel.html('fill opacity ' + (fillOpacitySlider.value()/100).toFixed(2));
	if (obstacleSpawnRateLabel && obstacleSpawnRateSlider) obstacleSpawnRateLabel.html('nucleation ' + (obstacleSpawnRateSlider.value()).toFixed(2) + 'x');
	if (obstacleRepelLabel && obstacleRepelSlider) obstacleRepelLabel.html('repel ' + (obstacleRepelSlider.value()).toFixed(2) + 'x');
}

function keyPressed() {
	if (key === 'i' || key === 'I') {
		DRAW_ALL_INTERNAL_SPRINGS = !DRAW_ALL_INTERNAL_SPRINGS;
	}
	if (key === 'c' || key === 'C') {
		DRAW_CENTER_SPRINGS = !DRAW_CENTER_SPRINGS;
	}
	if (key === 'n' || key === 'N') {
		instantiateNewSoftBody(mouseX, mouseY);
	}
}

function drawObjects() {
	const showFill = fillCheckbox ? fillCheckbox.checked() : true;
	const showRim = rimCheckbox ? rimCheckbox.checked() : true;
	const showWire = wireCheckbox ? wireCheckbox.checked() : false;
	const showSolid = solidCheckbox ? solidCheckbox.checked() : false;
	if (showSolid) drawSolidFill();
	if (showFill) drawRimFill();
	if (showWire) {
		stroke(0);
		for (var b = 0; b < blobs.length; b++) {
			let blob = blobs[b];
			let centre = blob.points[blob.points.length - 1];
			for (var i = 0; i < blob.springs.length; i++) {
				let p1 = blob.springs[i].point_1;
				let p2 = blob.springs[i].point_2;
				if (p1 === centre || p2 === centre) {
					let other = (p1 === centre) ? p2 : p1;
					drawSpokeToHub(other.x, other.y, centre.x, centre.y);
				} else {
					line(p1.x, p1.y, p2.x, p2.y);
				}
			}
			if (pointsCheckbox ? pointsCheckbox.checked() : false) {
				for (var k = 0; k < blob.points.length; k++) {
					circle(blob.points[k].x, blob.points[k].y, 4);
				}
			}
			drawHub(centre.x, centre.y);
		}
	}
	if (showRim) {
		stroke(0, 255, 0);
		strokeWeight(3);
		for (var b = 0; b < blobs.length; b++) {
			let blob = blobs[b];
			for (var j = 0; j < blob.vertexCount; j++) {
				let a = blob.points[2 * j + 1];
				let bpt = blob.points[(2 * ((j + 1) % blob.vertexCount)) + 1];
				line(a.x, a.y, bpt.x, bpt.y);
				if (DRAW_CENTER_SPRINGS) {
					let centre2 = blob.points[blob.points.length - 1];
					drawSpokeToHub(a.x, a.y, centre2.x, centre2.y);
				}
			}
			if (DRAW_CENTER_SPRINGS) {
				let c3 = blob.points[blob.points.length - 1];
				drawHub(c3.x, c3.y);
			}
		}
		strokeWeight(1);
	}
	for (var i = 0; i < obstacles.length; i++) {
		obstacles[i].draw();
	}
	if (vectorCheckbox ? vectorCheckbox.checked() : true) {
		drawForceVectors();
	}
	if ((vectorCheckbox ? vectorCheckbox.checked() : true) && draggingBlob && draggedPointIndex >= 0) {
		push();
		stroke(0, 255, 0);
		fill(0, 255, 0);
		let blob = (typeof draggedBlobIndex === 'number' && draggedBlobIndex >= 0 && draggedBlobIndex < blobs.length) ? blobs[draggedBlobIndex] : null;
		if (blob) {
			if (centerDragCheckbox && centerDragCheckbox.checked()) {
				let centre = blob.points[blob.points.length - 1];
				strokeWeight(2);
				let tx = (typeof keyboardTugActive !== 'undefined' && keyboardTugActive) ? virtualCursorX : mouseX;
				let ty = (typeof keyboardTugActive !== 'undefined' && keyboardTugActive) ? virtualCursorY : mouseY;
				line(centre.x, centre.y, tx, ty);
			} else {
				let isOuter = (draggedPointIndex % 2) === 1;
				let v = Math.floor(draggedPointIndex / 2);
				for (let k = -DRAG_NEIGHBOR_RANGE; k <= DRAG_NEIGHBOR_RANGE; k++) {
					let j = (v + k + blob.vertexCount) % blob.vertexCount;
					let idxPrimary = isOuter ? (2 * j + 1) : (2 * j);
					let idxPair = isOuter ? (2 * j) : (2 * j + 1);
					strokeWeight(2);
					let tx2 = (typeof keyboardTugActive !== 'undefined' && keyboardTugActive) ? virtualCursorX : mouseX;
					let ty2 = (typeof keyboardTugActive !== 'undefined' && keyboardTugActive) ? virtualCursorY : mouseY;
					line(blob.points[idxPrimary].x, blob.points[idxPrimary].y, tx2, ty2);
					strokeWeight(1);
					line(blob.points[idxPair].x, blob.points[idxPair].y, tx2, ty2);
				}
			}
		}
		// Removed mouse marker circle so the OS hand cursor remains visually unobstructed
		pop();
	}
}


function windowResized() {
	resizeCanvas(windowWidth, windowHeight);
	if (typeof uiPanel !== 'undefined' && uiPanel) {
		uiPanel.style('height', (windowHeight - 16) + 'px');
	}
}

