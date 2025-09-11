// Global simulation data structures (kept for compatibility during extraction)
let points = [];
let springs = [];
let obstacles = [];

function normalizeVec2(p) {
	let m = sqrt(p[0] * p[0] + p[1] * p[1]);
	if (!isFinite(m) || m < 1e-12) {
		return [0, 0];
	}
	return [p[0] / m, p[1] / m];
}

function getNorm(p) {
	let epsilon = 0.001;
	let v = sdf(p);
	return normalizeVec2([sdf([p[0]+epsilon,p[1]])-v,sdf([p[0],p[1]+epsilon])-v]);
}

function sdf_force(p) {
	if (obstacles.length === 0) {
		return [0, 0];
	}
	let norm = getNorm(p);
	let factor = min(exp(30 * -sdf(p)), 1000);
	if (!isFinite(norm[0]) || !isFinite(norm[1])) {
		return [0, 0];
	}
	return [factor * norm[0], factor * norm[1]];
}

function getDensityScale() {
	let v = densitySlider ? densitySlider.value() : 1;
	let dmin = 0.25, dmax = 2.0;
	return dmin + (dmax - dmin) * (1 - (v - dmin) / (dmax - dmin));
}

function updatePhysics() {
	for (var i = 0; i < points.length; i++) {
		points[i].ax = 0;
		let gscale = gravitySlider ? gravitySlider.value() : 1;
		let dscale = getDensityScale();
		points[i].ay = BASE_GRAVITY * gscale / dscale;
		let sdf_a = sdf_force([points[i].x, points[i].y]);
		points[i].ax += sdf_a[0];
		points[i].ay += sdf_a[1];
	}

	for (var s = 0; s < springs.length; s++) {
		springs[s].addAcceleration();
	}

	applyPressureForces();
	applyRimSelfRepulsion();
	applyRimBending();
	applyRimVelocitySmoothing();
	applyObstacleFriction();
	updateObstacleDynamics();

	if (draggingBlob && draggedPointIndex >= 0) {
		applyDistributedMouseTug(draggedPointIndex);
	}

	for (var i2 = 0; i2 < points.length; i2++) {
		let damp = 1;
		points[i2].vx += points[i2].ax * RATE;
		points[i2].vy += points[i2].ay * RATE;
		points[i2].vx *= exp(damp * -RATE);
		points[i2].vy *= exp(damp * -RATE);
		points[i2].x += points[i2].vx * RATE;
		points[i2].y += points[i2].vy * RATE;
	}
}

function sdf(p) {
	if (obstacles.length === 0) {
		return 1e9;
	}
	let d = obstacles[0].distance(p);
	for (var i = 1; i < obstacles.length; i++) {
		d = sdfCombine(d, obstacles[i].distance(p));
	}
	return d;
}

function sdfCombine(d1, d2) {
	if (d1 < 0 && d2 < 0){
		return max(d1, d2);
	} else {
		return min(d1, d2);
	}
}

function sdfCircle(p, o, r) {
	return sqrt(pow(p[0]-o[0],2)+pow(p[1]-o[1],2)) - r;
}

function computeBlobMass() {
	let area = abs(computeOuterArea());
	let density = getDensityScale();
	return max(1, area * BLOB_MASS_PER_AREA * density);
}

function updateObstacleDynamics() {
	if (obstacles.length === 0) return;
	let blobMass = computeBlobMass();
	for (var k = 0; k < obstacles.length; k++) {
		obstacles[k].ax = 0;
		obstacles[k].ay = 0;
		if (obstacleDensitySlider) {
			obstacles[k].mass = max(1, PI * obstacles[k].r * obstacles[k].r * OBSTACLE_DENSITY * obstacleDensitySlider.value());
		}
	}
	let mu = frictionSlider ? frictionSlider.value() : 0;
	if (mu > 0) {
		for (var i = 0; i < num_points; i++) {
			let p = points[2 * i + 1];
			let nearest = null;
			let minDist = 1e9;
			for (var j = 0; j < obstacles.length; j++) {
				let o = obstacles[j];
				let d = sqrt((p.x - o.x)*(p.x - o.x) + (p.y - o.y)*(p.y - o.y)) - o.r;
				if (d < minDist) { minDist = d; nearest = o; }
			}
			if (!nearest) continue;
			if (minDist < CONTACT_BAND) {
				let dx = p.x - nearest.x;
				let dy = p.y - nearest.y;
				let len = sqrt(dx*dx + dy*dy) + 1e-6;
				let nx = dx / len, ny = dy / len;
				let tx = -ny, ty = nx;
				let vt = p.vx * tx + p.vy * ty;
				let proximity = 1 - max(0, minDist) / CONTACT_BAND;
				let mag = CONTACT_FORCE_FACTOR * blobMass * mu * vt * proximity;
				let clampF = MAX_EXTRA_FORCE;
				let fx = -mag * tx;
				let fy = -mag * ty;
				let fm = sqrt(fx*fx + fy*fy);
				if (fm > clampF) { let s = clampF / (fm + 1e-6); fx *= s; fy *= s; }
				nearest.applyForce(fx, fy);
			}
		}
	}
	for (var m = 0; m < obstacles.length; m++) {
		let o = obstacles[m];
		o.vx += o.ax * RATE;
		o.vy += o.ay * RATE;
		o.vx *= exp(-OBSTACLE_DAMPING * RATE);
		o.vy *= exp(-OBSTACLE_DAMPING * RATE);
		o.x += o.vx * RATE;
		o.y += o.vy * RATE;
	}
}

function applyObstacleFriction() {
	if (!frictionSlider || obstacles.length === 0) return;
	let mu = frictionSlider.value();
	if (mu <= 0) return;
	for (var i = 0; i < num_points; i++) {
		let p = points[2 * i + 1];
		let nearest = null;
		let minDist = 1e9;
		for (var j = 0; j < obstacles.length; j++) {
			let o = obstacles[j];
			let d = sqrt((p.x - o.x)*(p.x - o.x) + (p.y - o.y)*(p.y - o.y)) - o.r;
			if (d < minDist) { minDist = d; nearest = o; }
		}
		if (!nearest) continue;
		if (minDist < CONTACT_BAND) {
			let dx = p.x - nearest.x;
			let dy = p.y - nearest.y;
			let len = sqrt(dx*dx + dy*dy) + 1e-6;
			let nx = dx / len;
			let ny = dy / len;
			let tx = -ny;
			let ty = nx;
			let vt = p.vx * tx + p.vy * ty;
			let proximity = 1 - max(0, minDist) / CONTACT_BAND;
			let fmag = -mu * vt * proximity;
			let maxF = MAX_EXTRA_FORCE * 0.4;
			if (fmag >  maxF) fmag =  maxF;
			if (fmag < -maxF) fmag = -maxF;
			p.ax += fmag * tx;
			p.ay += fmag * ty;
		}
	}
}

function applyDistributedMouseTug(baseIndex) {
	let isOuter = (baseIndex % 2) === 1;
	let v = Math.floor(baseIndex / 2);
	let indices = [];
	let shares = [];
	let totalShare = 0;
	for (let k = -DRAG_NEIGHBOR_RANGE; k <= DRAG_NEIGHBOR_RANGE; k++) {
		let baseW = Math.pow(DRAG_NEIGHBOR_DECAY, Math.abs(k));
		let j = (v + k + num_points) % num_points;
		let idxPrimary = isOuter ? (2 * j + 1) : (2 * j);
		let idxPair = isOuter ? (2 * j) : (2 * j + 1);
		let wPrimary = baseW;
		let wPair = DRAG_PAIR_WEIGHT * baseW;
		indices.push(idxPrimary); shares.push(wPrimary); totalShare += wPrimary;
		indices.push(idxPair);    shares.push(wPair);    totalShare += wPair;
	}
	if (totalShare < 1e-6) totalShare = 1;
	for (let s = 0; s < indices.length; s++) {
		applyMouseSpringNormalized(indices[s], shares[s], totalShare);
	}
}

function applyMouseSpringNormalized(pointIndex, share, totalShare) {
	let p = points[pointIndex];
	let dx = mouseX - p.x;
	let dy = mouseY - p.y;
	let shareNorm = share / totalShare;
	let fx = (MOUSE_SPRING_K * shareNorm) * dx - (MOUSE_SPRING_DAMP * DRAG_DAMP_MULTIPLIER * shareNorm) * p.vx;
	let fy = (MOUSE_SPRING_K * shareNorm) * dy - (MOUSE_SPRING_DAMP * DRAG_DAMP_MULTIPLIER * shareNorm) * p.vy;
	let maxF = MOUSE_MAX_FORCE * shareNorm;
	let fmag = sqrt(fx*fx + fy*fy);
	if (fmag > maxF) {
		let scale = maxF / (fmag + 1e-6);
		fx *= scale;
		fy *= scale;
	}
	p.ax += fx;
	p.ay += fy;
}

function computeOuterArea() {
	let area = 0;
	for (var i = 0; i < num_points; i++) {
		let a = points[2 * i + 1];
		let b = points[(2 * ((i + 1) % num_points)) + 1];
		area += a.x * b.y - b.x * a.y;
	}
	return 0.5 * area;
}

function applyPressureForces() {
	let area = computeOuterArea();
	if (softBody && softBody.restOuterArea !== 0) {
		restOuterArea = softBody.restOuterArea;
	}
	if (restOuterArea === 0) return;
	let rel = (restOuterArea - area) / restOuterArea;
	let k = rel > 0 ? PRESSURE_K * 1.25 : PRESSURE_K * 0.6;
	let dscaleP = getDensityScale();
	let pressure = (k * dscaleP) * rel;
	if (pressure === 0) return;
	let outwardSign = (area > 0) ? 1 : -1;
	for (var i = 0; i < num_points; i++) {
		let a = points[2 * i + 1];
		let b = points[(2 * ((i + 1) % num_points)) + 1];
		let ex = b.x - a.x;
		let ey = b.y - a.y;
		let len = sqrt(ex*ex + ey*ey) + 1e-6;
		let nx = outwardSign * (ey / len);
		let ny = outwardSign * (-ex / len);
		let f = pressure * len;
		let mag = min(abs(f), MAX_PRESSURE_FORCE);
		let fx = mag * Math.sign(f) * nx;
		let fy = mag * Math.sign(f) * ny;
		a.ax += fx * 0.5;
		a.ay += fy * 0.5;
		b.ax += fx * 0.5;
		b.ay += fy * 0.5;
	}
}

function applyRimSelfRepulsion() {
	for (var i = 0; i < num_points; i++) {
		let ai = 2 * i + 1;
		let a = points[ai];
		for (var j = i + 2; j < num_points; j++) {
			if ((i === 0 && j === num_points - 1)) continue;
			let bi = 2 * j + 1;
			let b = points[bi];
			let dx = b.x - a.x;
			let dy = b.y - a.y;
			let d2 = dx*dx + dy*dy;
			let r = SELF_REPEL_RADIUS;
			if (d2 < r*r) {
				let d = sqrt(d2) + 1e-6;
				let ux = dx / d;
				let uy = dy / d;
				let overlap = 1 - (d / r);
				let mag = SELF_REPEL_STRENGTH * overlap;
				mag = min(mag, MAX_EXTRA_FORCE);
				let fx = mag * ux;
				let fy = mag * uy;
				a.ax -= fx;
				a.ay -= fy;
				b.ax += fx;
				b.ay += fy;
			}
		}
	}
}

function applyRimBending() {
	for (var i = 0; i < num_points; i++) {
		let prev = (i - 1 + num_points) % num_points;
		let next = (i + 1) % num_points;
		let pPrev = points[2 * prev + 1];
		let pCurr = points[2 * i + 1];
		let pNext = points[2 * next + 1];
		let lapx = pPrev.x + pNext.x - 2 * pCurr.x;
		let lapy = pPrev.y + pNext.y - 2 * pCurr.y;
		let bx = BENDING_K * lapx;
		let by = BENDING_K * lapy;
		let bmag = sqrt(bx*bx + by*by);
		if (bmag > MAX_EXTRA_FORCE) {
			let s = MAX_EXTRA_FORCE / (bmag + 1e-6);
			bx *= s;
			by *= s;
		}
		pCurr.ax += bx;
		pCurr.ay += by;
	}
}

function applyRimVelocitySmoothing() {
	for (var i = 0; i < num_points; i++) {
		let prev = (i - 1 + num_points) % num_points;
		let next = (i + 1) % num_points;
		let pPrev = points[2 * prev + 1];
		let pCurr = points[2 * i + 1];
		let pNext = points[2 * next + 1];
		let vLapx = pPrev.vx + pNext.vx - 2 * pCurr.vx;
		let vLapy = pPrev.vy + pNext.vy - 2 * pCurr.vy;
		pCurr.vx += VISC_BEND_COEF * vLapx * RATE;
		pCurr.vy += VISC_BEND_COEF * vLapy * RATE;
	}
}

function initializeBlob(newNumPoints) {
	points = [];
	springs = [];
	num_points = newNumPoints;
	for (var i = 0; i < num_points; i++) {
		points.push(new Point(width/2 + inner_radius * cos(2 * PI * i / num_points), height/2 + inner_radius * sin(2 * PI * i / num_points)));
		points.push(new Point(width/2 + outer_radius * cos(2 * PI * i / num_points), height/2 + outer_radius * sin(2 * PI * i / num_points)));
	}
	points.push(new Point(width/2, height/2));
	let centre = points[points.length - 1];
	for (var i = 0; i < num_points; i++) {
		springs.push(new Spring(points[2 * i], points[2 * i + 1], OUTER_RIM_K));
		springs.push(new Spring(points[2 * i + 1], points[(2 * i + 2) % (2 * num_points)], OUTER_RIM_K));
		springs.push(new Spring(points[2 * i], points[(2 * i + 3) % (2 * num_points)], OUTER_RIM_K));
		springs.push(new Spring(points[2 * i], points[(2 * i + 2) % (2 * num_points)], OUTER_RIM_K));
		springs.push(new Spring(points[2 * i + 1], points[(2 * i + 3) % (2 * num_points)], OUTER_RIM_K));
		springs.push(new Spring(
			points[2 * i + 1],
			points[(2 * ((i + 2) % num_points)) + 1],
			BEND_SPRING_K
		));
		springs.push(new Spring(points[2 * i], centre, INNER_SPOKE_K));
		springs.push(new Spring(points[2 * i + 1], centre, INNER_SPOKE_K));
	}
}


