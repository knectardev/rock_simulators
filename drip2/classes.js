class Point {
	constructor(x, y) {
		this.ax = 0;
		this.ay = 0;
		this.vx = 0;
		this.vy = 0;
		this.x = x;
		this.y = y;
	}
}

class Spring {
	constructor(point_1, point_2, k) {
		this.point_1 = point_1;
		this.point_2 = point_2;
		this.mean = pointDistance(point_1, point_2);
		this.k = k;
	}

	addAcceleration() {
		let l = pointDistance(this.point_1, this.point_2);
		if (!isFinite(l) || !isFinite(this.mean) || this.mean < 1e-9 || l < 1e-9) {
			return;
		}
		let delta_l = l - this.mean;
		let a = -this.k * delta_l / this.mean;
		let ux = (this.point_1.x - this.point_2.x) / (l + 1e-9);
		let uy = (this.point_1.y - this.point_2.y) / (l + 1e-9);
		let fx = ux * a;
		let fy = uy * a;
		// Clamp to safety cap
		let mag = Math.sqrt(fx*fx + fy*fy);
		let maxF = (typeof MAX_EXTRA_FORCE !== 'undefined') ? MAX_EXTRA_FORCE : 6000;
		if (mag > maxF) {
			let s = maxF / (mag + 1e-9);
			fx *= s;
			fy *= s;
		}
		this.point_1.ax += fx;
		this.point_1.ay += fy;
		this.point_2.ax -= fx;
		this.point_2.ay -= fy;
	}
}

class ObstacleCircle {
	constructor(x, y, r) {
		this.x = x;
		this.y = y;
		this.r = r;
		this.vx = 0;
		this.vy = 0;
		this.ax = 0;
		this.ay = 0;
		this.mass = max(1, PI * r * r * OBSTACLE_DENSITY);
		this.trail = [];
		this.attachedBlobIndex = -1;
	}

	distance(p) {
		return sqrt(pow(p[0]-this.x,2)+pow(p[1]-this.y,2)) - this.r;
	}

	draw() {
		push();
		stroke(0);
		if (this.attachedBlobIndex >= 0) {
			fill(255, 255, 255, 179); // ~70% opacity when attached
		} else {
			fill(255);
		}
		circle(this.x, this.y, 2 * this.r);
		pop();
	}

	applyForce(fx, fy) {
		this.ax += fx / this.mass;
		this.ay += fy / this.mass;
	}

	contains(px, py) {
		return sqrt(pow(px - this.x, 2) + pow(py - this.y, 2)) <= this.r;
	}

	updateTrail() {
		if (!OBSTACLE_TRAIL_ENABLED) return;
		let last = this.trail.length > 0 ? this.trail[this.trail.length - 1] : null;
		let dx = last ? (this.x - last.x) : OBSTACLE_TRAIL_MIN_DIST + 1;
		let dy = last ? (this.y - last.y) : 0;
		let d2 = dx*dx + dy*dy;
		if (!last || d2 >= OBSTACLE_TRAIL_MIN_DIST * OBSTACLE_TRAIL_MIN_DIST) {
			this.trail.push({ x: this.x, y: this.y });
			if (this.trail.length > OBSTACLE_TRAIL_MAX_POINTS) {
				this.trail.shift();
			}
		}
	}
}

class SoftBody {
	constructor(innerRadius, outerRadius, vertexCount) {
		this.innerRadius = innerRadius;
		this.outerRadius = outerRadius;
		this.vertexCount = vertexCount;
		this.restOuterArea = 0;
	}

	initializeGeometry() {
		inner_radius = this.innerRadius;
		outer_radius = this.outerRadius;
		thickness = outer_radius - inner_radius;
		SELF_REPEL_RADIUS = thickness * 1.6;
		// Rebuild the active blob if present; otherwise create a new one
		let cx = arguments.length >= 2 ? arguments[0] : undefined;
		let cy = arguments.length >= 2 ? arguments[1] : undefined;
		if (typeof blobs !== 'undefined' && blobs.length > 0) {
			let active = blobs[blobs.length - 1];
			active.innerRadius = this.innerRadius;
			active.outerRadius = this.outerRadius;
			active.vertexCount = this.vertexCount;
			let centerPoint = active.points && active.points.length > 0 ? active.points[active.points.length - 1] : null;
			let rx = (typeof cx === 'number') ? cx : (centerPoint ? centerPoint.x : width/2);
			let ry = (typeof cy === 'number') ? cy : (centerPoint ? centerPoint.y : height/2);
			active.build(rx, ry);
			active.restOuterArea = active.computeOuterArea();
			this.restOuterArea = active.restOuterArea;
			restOuterArea = this.restOuterArea;
		} else {
			let bx = (typeof cx === 'number') ? cx : width/2;
			let by = (typeof cy === 'number') ? cy : height/2;
			let blob = new BlobInstance(this.innerRadius, this.outerRadius, this.vertexCount, bx, by);
			blob.restOuterArea = blob.computeOuterArea();
			if (typeof blobs !== 'undefined') {
				blobs.push(blob);
			}
			this.restOuterArea = blob.restOuterArea;
			restOuterArea = this.restOuterArea;
		}
	}

	rebuildVertexCount(newCount) {
		this.vertexCount = newCount;
		// If multi-blob system is active, update all blobs to maintain stability
		if (typeof blobs !== 'undefined' && blobs.length > 0) {
			for (var b = 0; b < blobs.length; b++) {
				let center = blobs[b].points[blobs[b].points.length - 1];
				blobs[b].vertexCount = newCount;
				blobs[b].build(center.x, center.y);
				blobs[b].restOuterArea = blobs[b].computeOuterArea();
			}
			this.restOuterArea = blobs[blobs.length - 1].restOuterArea;
			restOuterArea = this.restOuterArea;
		} else {
			this.initializeGeometry();
		}
	}

	rebuildThickness(targetThickness) {
		this.innerRadius = max(10, this.outerRadius - targetThickness);
		this.initializeGeometry();
	}
}


class BlobInstance {
	constructor(innerRadius, outerRadius, vertexCount, centerX, centerY) {
		this.innerRadius = innerRadius;
		this.outerRadius = outerRadius;
		this.vertexCount = vertexCount;
		this.points = [];
		this.springs = [];
		this.restOuterArea = 0;
		this.blobVisFx = 0;
		this.blobVisFy = 0;
		this.isChild = false; // if true, this blob cannot be split further
		this.build(centerX, centerY);
	}

	build(centerX, centerY) {
		let cx = (typeof centerX === 'number') ? centerX : width/2;
		let cy = (typeof centerY === 'number') ? centerY : height/2;
		this.points = [];
		this.springs = [];
		for (var i = 0; i < this.vertexCount; i++) {
			this.points.push(new Point(cx + this.innerRadius * cos(2 * PI * i / this.vertexCount), cy + this.innerRadius * sin(2 * PI * i / this.vertexCount)));
			this.points.push(new Point(cx + this.outerRadius * cos(2 * PI * i / this.vertexCount), cy + this.outerRadius * sin(2 * PI * i / this.vertexCount)));
		}
		this.points.push(new Point(cx, cy));
		let centre = this.points[this.points.length - 1];
		for (var i = 0; i < this.vertexCount; i++) {
			this.springs.push(new Spring(this.points[2 * i], this.points[2 * i + 1], OUTER_RIM_K));
			this.springs.push(new Spring(this.points[2 * i + 1], this.points[(2 * i + 2) % (2 * this.vertexCount)], OUTER_RIM_K));
			this.springs.push(new Spring(this.points[2 * i], this.points[(2 * i + 3) % (2 * this.vertexCount)], OUTER_RIM_K));
			this.springs.push(new Spring(this.points[2 * i], this.points[(2 * i + 2) % (2 * this.vertexCount)], OUTER_RIM_K));
			this.springs.push(new Spring(this.points[2 * i + 1], this.points[(2 * i + 3) % (2 * this.vertexCount)], OUTER_RIM_K));
			this.springs.push(new Spring(
				this.points[2 * i + 1],
				this.points[(2 * ((i + 2) % this.vertexCount)) + 1],
				BEND_SPRING_K
			));
			this.springs.push(new Spring(this.points[2 * i], centre, INNER_SPOKE_K));
			this.springs.push(new Spring(this.points[2 * i + 1], centre, INNER_SPOKE_K));
		}
		this.restOuterArea = this.computeOuterArea();
	}

	computeOuterArea() {
		let area = 0;
		for (var i = 0; i < this.vertexCount; i++) {
			let a = this.points[2 * i + 1];
			let b = this.points[(2 * ((i + 1) % this.vertexCount)) + 1];
			area += a.x * b.y - b.x * a.y;
		}
		return 0.5 * area;
	}
}

