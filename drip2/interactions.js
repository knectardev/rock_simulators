let draggingObstacle = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let draggingBlob = false;
let draggedPointIndex = -1;
let draggedBlobIndex = -1;
let SPAWN_PAUSED = false;
let hiddenObstaclesBackup = [];

function handleGlobalKeydown(e) {
	if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
		SPAWN_PAUSED = !SPAWN_PAUSED;
		if (SPAWN_PAUSED) {
			// Hide obstacles by stashing current list
			if (obstacles && obstacles.length > 0) {
				hiddenObstaclesBackup = obstacles;
				obstacles = [];
			}
		} else {
			// Restore previously hidden obstacles
			if ((!obstacles || obstacles.length === 0) && hiddenObstaclesBackup && hiddenObstaclesBackup.length > 0) {
				obstacles = hiddenObstaclesBackup;
				hiddenObstaclesBackup = [];
			}
		}
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
		let bestB = -1, bestIdx = -1, bestD2 = 1e18, bestOuter = outer_radius;
		for (var b = 0; b < blobs.length; b++) {
			let blob = blobs[b];
			for (var i = 0; i < blob.points.length - 1; i++) {
				let dx = mouseX - blob.points[i].x;
				let dy = mouseY - blob.points[i].y;
				let d2 = dx*dx + dy*dy;
				if (d2 < bestD2) { bestD2 = d2; bestIdx = i; bestB = b; bestOuter = blob.outerRadius; }
			}
		}
		if (bestIdx >= 0 && sqrt(bestD2) <= bestOuter * 1.5) {
			draggingBlob = true;
			draggedBlobIndex = bestB;
			draggedPointIndex = bestIdx;
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
	draggedBlobIndex = -1;
}

function applyGlobalScroll() {
	let gscale = gravitySlider ? gravitySlider.value() : 1;
	let dy = -BASE_GRAVITY * gscale * RATE;
	if (typeof blobs !== 'undefined') {
		for (var b = 0; b < blobs.length; b++) {
			for (var i = 0; i < blobs[b].points.length; i++) {
				blobs[b].points[i].y += dy;
			}
		}
	}
	for (var j = 0; j < obstacles.length; j++) {
		obstacles[j].y += dy;
		// Also scroll their trails
		if (obstacles[j].trail && obstacles[j].trail.length > 0) {
			for (var t = 0; t < obstacles[j].trail.length; t++) {
				obstacles[j].trail[t].y += dy;
			}
		}
	}
	// Scroll archived blobs with the scene
	if (typeof archivedBlobs !== 'undefined' && archivedBlobs.length > 0) {
		for (var b = 0; b < archivedBlobs.length; b++) {
			let poly = archivedBlobs[b].outer;
			for (var p = 0; p < poly.length; p++) {
				poly[p].y += dy;
			}
		}
	}
}

function spawnObstacleBelow() {
	let rmin = CANVAS_SIZE / 24;
	let rmax = CANVAS_SIZE / 6;
	let rr = random(rmin, rmax);
	// Span full width while keeping circle fully inside [0, width]
	let x = random(rr, max(rr + 1, width - rr));
	let y = height + rr + random(CANVAS_SIZE * 0.1, CANVAS_SIZE * 0.6);
	return new ObstacleCircle(x, y, rr);
}

function spawnObstacleInView() {
    let rmin = CANVAS_SIZE / 24;
    let rmax = CANVAS_SIZE / 6;
    let rr = random(rmin, rmax);
    // Ensure obstacle fully inside viewport horizontally and vertically
    let x = random(rr, max(rr + 1, width - rr));
    let y = random(rr, max(rr + 1, height - rr));
    return new ObstacleCircle(x, y, rr);
}

function recycleObstacles() {
	for (var i = obstacles.length - 1; i >= 0; i--) {
		if (obstacles[i].y + obstacles[i].r < 0) {
			obstacles.splice(i, 1);
		}
	}
	if (!SPAWN_PAUSED) {
		let rate = obstacleSpawnRateSlider ? obstacleSpawnRateSlider.value() : 1.0;
		let target = Math.floor(OBSTACLE_COUNT * rate);
		if (target < 0) target = 0;
		if (rate === 0) target = 0;
		while (obstacles.length < target) {
			obstacles.push(spawnObstacleBelow());
		}
	}
}


