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
		let delta_l = l - this.mean;
		let a = -this.k * delta_l / this.mean;
		let ax = (this.point_1.x - this.point_2.x) / l * a;
		let ay = (this.point_1.y - this.point_2.y) / l * a;
		this.point_1.ax += ax;
		this.point_1.ay += ay;
		this.point_2.ax -= ax;
		this.point_2.ay -= ay;
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
	}

	distance(p) {
		return sqrt(pow(p[0]-this.x,2)+pow(p[1]-this.y,2)) - this.r;
	}

	draw() {
		push();
		stroke(0);
		fill(255);
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
		initializeBlob(this.vertexCount);
		this.restOuterArea = computeOuterArea();
		restOuterArea = this.restOuterArea;
	}

	rebuildVertexCount(newCount) {
		this.vertexCount = newCount;
		this.initializeGeometry();
	}

	rebuildThickness(targetThickness) {
		this.innerRadius = max(10, this.outerRadius - targetThickness);
		this.initializeGeometry();
	}
}


