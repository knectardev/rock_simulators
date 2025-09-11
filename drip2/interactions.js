let draggingObstacle = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let draggingBlob = false;
let draggedPointIndex = -1;
let SPAWN_PAUSED = false;

function handleGlobalKeydown(e) {
	if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
		SPAWN_PAUSED = !SPAWN_PAUSED;
		obstacles = [];
		e.preventDefault();
	}
}

function mousePressed() {
	for (var i = obstacles.length - 1; i >= 0; i--) {
		if (obstacles[i].contains(mouseX, mouseY)) {
			draggingObstacle = obstacles[i];
			dragOffsetX = mouseX - draggingObstacle.x;
			dragOffsetY = mouseY - draggingObstacle.y;
			break;
		}
	}
	if (!draggingObstacle) {
		let minDist2 = 1e18;
		let minIdx = -1;
		for (var i = 0; i < points.length - 1; i++) {
			let dx = mouseX - points[i].x;
			let dy = mouseY - points[i].y;
			let d2 = dx*dx + dy*dy;
			if (d2 < minDist2) { minDist2 = d2; minIdx = i; }
		}
		if (minIdx >= 0 && sqrt(minDist2) <= outer_radius * 1.5) {
			draggingBlob = true;
			draggedPointIndex = minIdx;
		}
	}
}

function mouseDragged() {
	if (draggingObstacle) {
		draggingObstacle.x = mouseX - dragOffsetX;
		draggingObstacle.y = mouseY - dragOffsetY;
	}
}

function mouseReleased() {
	draggingObstacle = null;
	draggingBlob = false;
	draggedPointIndex = -1;
	restOuterArea = computeOuterArea();
	if (softBody) softBody.restOuterArea = restOuterArea;
}

function applyGlobalScroll() {
	let gscale = gravitySlider ? gravitySlider.value() : 1;
	let dy = -BASE_GRAVITY * gscale * RATE;
	for (var i = 0; i < points.length; i++) {
		points[i].y += dy;
	}
	for (var j = 0; j < obstacles.length; j++) {
		obstacles[j].y += dy;
	}
}

function spawnObstacleBelow() {
	let rmin = CANVAS_SIZE / 24;
	let rmax = CANVAS_SIZE / 6;
	let rr = random(rmin, rmax);
	let x = random(CANVAS_SIZE * 0.1, CANVAS_SIZE * 0.9);
	let y = height + rr + random(CANVAS_SIZE * 0.1, CANVAS_SIZE * 0.6);
	return new ObstacleCircle(x, y, rr);
}

function recycleObstacles() {
	for (var i = obstacles.length - 1; i >= 0; i--) {
		if (obstacles[i].y + obstacles[i].r < 0) {
			obstacles.splice(i, 1);
		}
	}
	if (!SPAWN_PAUSED) {
		while (obstacles.length < OBSTACLE_COUNT) {
			obstacles.push(spawnObstacleBelow());
		}
	}
}


