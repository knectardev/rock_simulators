let draggingObstacle = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let draggingBlob = false;
let draggedPointIndex = -1;
let draggedBlobIndex = -1;
let SPAWN_PAUSED = false;
let hiddenObstaclesBackup = [];
let keyboardTugActive = false;
let virtualCursorX = 0;
let virtualCursorY = 0;

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
	// Arrow key control for blob position (virtual cursor)
	if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
		// Activate keyboard tug on first use
		if (!keyboardTugActive) {
			keyboardTugActive = true;
			// Initialize strictly from blob centre (or canvas centre); ignore mouse entirely
			if (typeof blobs !== 'undefined' && blobs.length > 0) {
				let c = blobs[blobs.length - 1].points[blobs[blobs.length - 1].points.length - 1];
				virtualCursorX = c.x;
				virtualCursorY = c.y;
			} else {
				virtualCursorX = width/2;
				virtualCursorY = height/2;
			}
		}
		let step = KEY_TUG_SPEED * RATE;
		if (e.code === 'ArrowLeft')  virtualCursorX -= step;
		if (e.code === 'ArrowRight') virtualCursorX += step;
		if (e.code === 'ArrowUp')    virtualCursorY -= step;
		if (e.code === 'ArrowDown')  virtualCursorY += step;
		// Begin a drag on nearest blob centre if not already dragging
		if (!draggingBlob && typeof blobs !== 'undefined' && blobs.length > 0) {
			let idx = blobs.length - 1;
			draggingBlob = true;
			draggedBlobIndex = idx;
			draggedPointIndex = blobs[idx].points.length - 1; // hub
		}
		e.preventDefault();
	}
}

function mousePressed() {
    // If keyboard tug was active, clicking switches control back to mouse
    if (keyboardTugActive) {
        keyboardTugActive = false;
    }
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
			if (typeof centerDragCheckbox !== 'undefined' && centerDragCheckbox.checked()) {
				// In center-drag mode, select the hub point (last point)
				let centreIndex = blob.points.length - 1;
				let cdx = mouseX - blob.points[centreIndex].x;
				let cdy = mouseY - blob.points[centreIndex].y;
				let cd2 = cdx*cdx + cdy*cdy;
				if (cd2 < bestD2) { bestD2 = cd2; bestIdx = centreIndex; bestB = b; bestOuter = blob.outerRadius; }
			} else {
				for (var i = 0; i < blob.points.length - 1; i++) {
					let dx = mouseX - blob.points[i].x;
					let dy = mouseY - blob.points[i].y;
					let d2 = dx*dx + dy*dy;
					if (d2 < bestD2) { bestD2 = d2; bestIdx = i; bestB = b; bestOuter = blob.outerRadius; }
				}
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
    // Do not stop keyboard-driven drag on mouse release
    if (!keyboardTugActive) {
        draggingBlob = false;
        draggedPointIndex = -1;
        draggedBlobIndex = -1;
    }
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


