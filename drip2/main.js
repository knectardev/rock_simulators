// UI elements
let rSlider, vertexSlider, gravitySlider, densitySlider, fillColorSlider, thicknessSlider, frictionSlider, obstacleDensitySlider;
let rLabel, vertexLabel, gravityLabel, densityLabel, thicknessLabel, fillLabel, frictionLabel, obstacleDensityLabel;
let uiPanel;
let fillCheckbox, rimCheckbox, wireCheckbox, pointsCheckbox, solidCheckbox;
let BASE_NUM_POINTS;

let ADD_RANDOM_CROSS_SPRINGS = false;
let DRAW_ALL_INTERNAL_SPRINGS = false;
let DRAW_CENTER_SPRINGS = false;

let num_points = 60;
let thickness = CANVAS_SIZE / 40;
let inner_radius = CANVAS_SIZE / 5;
let outer_radius = inner_radius + thickness;
let restOuterArea = 0;
let blobVisFx = 0;
let blobVisFy = 0;
let softBody = null;

function setup() {
	frameRate(FRAME);
	createCanvas(1200, 800);
	textSize(15);
	uiPanel = createDiv('');
	uiPanel.position(8, 8);
	uiPanel.style('background', 'rgba(255,255,255,0.7)');
	uiPanel.style('border', '1px solid #000');
	uiPanel.style('padding', '8px');
	uiPanel.style('width', '360px');
	uiPanel.style('height', '420px');
	uiPanel.style('z-index', '0');

	rSlider = createSlider(0, 255, 255);
	rSlider.position(20, 20);
	styleSlider(rSlider);
	vertexSlider = createSlider(-1, 1, 0, 0.01);
	vertexSlider.position(20, 50);
	styleSlider(vertexSlider);
	gravitySlider = createSlider(0.5, 5.0, 1.0, 0.01);
	gravitySlider.position(20, 80);
	styleSlider(gravitySlider);
	densitySlider = createSlider(0.25, 2.0, 1.0, 0.01);
	densitySlider.position(20, 110);
	styleSlider(densitySlider);
	thicknessSlider = createSlider(10, 50, constrain(thickness, 10, 50), 1);
	thicknessSlider.position(20, 140);
	styleSlider(thicknessSlider);
	fillColorSlider = createSlider(0, 255, 0, 1);
	fillColorSlider.position(20, 170);
	styleSlider(fillColorSlider);
	frictionSlider = createSlider(0, 10, 2.5, 0.1);
	frictionSlider.position(20, 200);
	styleSlider(frictionSlider);
	obstacleDensitySlider = createSlider(0.25, 4.0, 1.0, 0.01);
	obstacleDensitySlider.position(20, 230);
	styleSlider(obstacleDensitySlider);

	rLabel = createDiv('red');
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
	frictionLabel = createDiv('friction 0.00');
	styleLabel(frictionLabel);
	frictionLabel.position(frictionSlider.x + frictionSlider.width + 16, frictionSlider.y - 4);
	obstacleDensityLabel = createDiv('obstacle density 1.00x');
	styleLabel(obstacleDensityLabel);
	obstacleDensityLabel.position(obstacleDensitySlider.x + obstacleDensitySlider.width + 16, obstacleDensitySlider.y - 4);

	fillCheckbox = createCheckbox('Display blob fill', false);
	fillCheckbox.position(20, 250);
	styleCheckbox(fillCheckbox);
	rimCheckbox = createCheckbox('Display blob border rim', false);
	rimCheckbox.position(20, 275);
	styleCheckbox(rimCheckbox);
	wireCheckbox = createCheckbox('Display blob wire-frame', true);
	wireCheckbox.position(20, 300);
	styleCheckbox(wireCheckbox);
	pointsCheckbox = createCheckbox('Display mesh points', false);
	pointsCheckbox.position(20, 325);
	styleCheckbox(pointsCheckbox);
	solidCheckbox = createCheckbox('Display blob solid interior', false);
	solidCheckbox.position(20, 350);
	styleCheckbox(solidCheckbox);

	BASE_NUM_POINTS = num_points;
	softBody = new SoftBody(inner_radius, outer_radius, num_points);
	softBody.initializeGeometry();
	obstacles = [
		new ObstacleCircle(CANVAS_SIZE/3, CANVAS_SIZE, CANVAS_SIZE/8),
		new ObstacleCircle(3*CANVAS_SIZE/3, CANVAS_SIZE, CANVAS_SIZE/16),
		new ObstacleCircle(CANVAS_SIZE*3.5/4, CANVAS_SIZE*2/3, CANVAS_SIZE/20)
	];
	window.addEventListener('keydown', handleGlobalKeydown);
}

function draw() {
	const r = rSlider ? rSlider.value() : 255;
	const vertFactor = pow(2, vertexSlider ? vertexSlider.value() : 0);
	const targetVerts = max(4, Math.round(BASE_NUM_POINTS * vertFactor));
	if (targetVerts !== num_points) {
		softBody.rebuildVertexCount(targetVerts);
		draggingBlob = false;
		draggedPointIndex = -1;
	}
	const g = 11;
	const gravScale = gravitySlider ? gravitySlider.value() : 1;
	const densityScale = densitySlider ? densitySlider.value() : 1;
	background(r, g, BACKGROUND_BLUE);
	BLOB_FILL_GRAY = fillColorSlider ? fillColorSlider.value() : 0;
	const targetThickness = thicknessSlider ? thicknessSlider.value() : thickness;
	if (targetThickness !== thickness) {
		softBody.rebuildThickness(targetThickness);
		draggingBlob = false;
		draggedPointIndex = -1;
	}
	updatePhysics();
	applyGlobalScroll();
	recycleObstacles();
	drawObjects();
	if (vertexLabel) vertexLabel.html('vertices ' + num_points);
	if (gravityLabel) gravityLabel.html('gravity ' + gravScale.toFixed(2) + 'x');
	if (densityLabel) densityLabel.html('density ' + getDensityScale().toFixed(2) + 'x');
	if (thicknessLabel) thicknessLabel.html('rim thickness ' + Math.round(thickness) + 'px');
	if (frictionLabel && frictionSlider) frictionLabel.html('friction ' + (frictionSlider.value() * 1.0).toFixed(2));
	if (obstacleDensityLabel && obstacleDensitySlider) obstacleDensityLabel.html('obstacle density ' + obstacleDensitySlider.value().toFixed(2) + 'x');
}

function keyPressed() {
	if (key === 'i' || key === 'I') {
		DRAW_ALL_INTERNAL_SPRINGS = !DRAW_ALL_INTERNAL_SPRINGS;
	}
	if (key === 'c' || key === 'C') {
		DRAW_CENTER_SPRINGS = !DRAW_CENTER_SPRINGS;
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
		let centre = points[points.length - 1];
		stroke(0);
		for (var i = 0; i < springs.length; i++) {
			let p1 = springs[i].point_1;
			let p2 = springs[i].point_2;
			if (p1 === centre || p2 === centre) {
				let other = (p1 === centre) ? p2 : p1;
				drawSpokeToHub(other.x, other.y, centre.x, centre.y);
			} else {
				line(p1.x, p1.y, p2.x, p2.y);
			}
		}
		if (pointsCheckbox ? pointsCheckbox.checked() : false) {
			for (var k = 0; k < points.length; k++) {
				circle(points[k].x, points[k].y, 4);
			}
		}
		drawHub();
	}
	if (showRim) {
		stroke(0);
		strokeWeight(2);
		for (var j = 0; j < num_points; j++) {
			let a = points[2 * j + 1];
			let b = points[(2 * ((j + 1) % num_points)) + 1];
			line(a.x, a.y, b.x, b.y);
			if (DRAW_CENTER_SPRINGS) {
				let centre2 = points[points.length - 1];
				drawSpokeToHub(a.x, a.y, centre2.x, centre2.y);
			}
		}
		if (DRAW_CENTER_SPRINGS) {
			drawHub();
		}
		strokeWeight(1);
	}
	for (var i = 0; i < obstacles.length; i++) {
		obstacles[i].draw();
	}
	drawForceVectors();
	if (draggingBlob && draggedPointIndex >= 0) {
		push();
		stroke(0, 255, 0);
		fill(0, 255, 0);
		let isOuter = (draggedPointIndex % 2) === 1;
		let v = Math.floor(draggedPointIndex / 2);
		for (let k = -DRAG_NEIGHBOR_RANGE; k <= DRAG_NEIGHBOR_RANGE; k++) {
			let j = (v + k + num_points) % num_points;
			let idxPrimary = isOuter ? (2 * j + 1) : (2 * j);
			let idxPair = isOuter ? (2 * j) : (2 * j + 1);
			strokeWeight(2);
			line(points[idxPrimary].x, points[idxPrimary].y, mouseX, mouseY);
			strokeWeight(1);
			line(points[idxPair].x, points[idxPair].y, mouseX, mouseY);
		}
		circle(mouseX, mouseY, 8);
		pop();
	}
}


