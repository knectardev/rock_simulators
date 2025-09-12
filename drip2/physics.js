// Global simulation data structures (kept for compatibility during extraction)
let points = [];
let springs = [];
let obstacles = [];
let blobs = [];
let lastSplitAt = 0;

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
    if (window.__freezeFrames && window.__freezeFrames > 0) {
        window.__freezeFrames--;
        return;
    }
	for (var b = 0; b < blobs.length; b++) {
		let blob = blobs[b];
		let bp = blob.points;
		let bs = blob.springs;
		for (var i = 0; i < bp.length; i++) {
			// Sanity guard against NaN/Inf in positions and velocities
			if (!isFinite(bp[i].x) || !isFinite(bp[i].y) || !isFinite(bp[i].vx) || !isFinite(bp[i].vy)) {
				let cguard = bp[bp.length - 1];
				bp[i].x = cguard.x;
				bp[i].y = cguard.y;
				bp[i].vx = 0;
				bp[i].vy = 0;
			}
			bp[i].ax = 0;
			let gscale = gravitySlider ? gravitySlider.value() : 1;
			let dscale = getDensityScale();
			bp[i].ay = BASE_GRAVITY * gscale / dscale;
			let sdf_a = sdf_force([bp[i].x, bp[i].y]);
			bp[i].ax += sdf_a[0];
			bp[i].ay += sdf_a[1];
		}
		for (var s = 0; s < bs.length; s++) {
			bs[s].addAcceleration();
		}
		applyPressureForcesForBlob(blob);
		applyRimSelfRepulsionForBlob(blob);
		applyRimBendingForBlob(blob);
		applyRimVelocitySmoothingForBlob(blob);
		// Post-force clamp to avoid runaway accelerations per point
		for (var ci = 0; ci < bp.length; ci++) {
			let amag = Math.sqrt(bp[ci].ax*bp[ci].ax + bp[ci].ay*bp[ci].ay);
			if (amag > MAX_EXTRA_FORCE) {
				let s = MAX_EXTRA_FORCE / (amag + 1e-9);
				bp[ci].ax *= s;
				bp[ci].ay *= s;
			}
		}
	}
	applyObstacleFrictionMulti();
	updateObstacleDynamicsMulti();
	if (draggingBlob && typeof draggedBlobIndex === 'number' && draggedBlobIndex >= 0 && draggedPointIndex >= 0 && draggedBlobIndex < blobs.length) {
		let blobDrag = blobs[draggedBlobIndex];
		if (typeof centerDragCheckbox !== 'undefined' && centerDragCheckbox.checked()) {
			let centre = blobDrag.points[blobDrag.points.length - 1];
			if (typeof CENTER_DRAG_RIGID !== 'undefined' && CENTER_DRAG_RIGID) {
				// Rigid translation: move entire blob towards mouse by delta; minimal deformation
				let targetX = keyboardTugActive ? virtualCursorX : mouseX;
				let targetY = keyboardTugActive ? virtualCursorY : mouseY;
				let dx = (targetX - centre.x) * CENTER_RIGID_FOLLOW_GAIN;
				let dy = (targetY - centre.y) * CENTER_RIGID_FOLLOW_GAIN;
				for (var rp = 0; rp < blobDrag.points.length; rp++) {
					blobDrag.points[rp].x += dx;
					blobDrag.points[rp].y += dy;
					blobDrag.points[rp].vx *= exp(-CENTER_RIGID_DAMP * RATE);
					blobDrag.points[rp].vy *= exp(-CENTER_RIGID_DAMP * RATE);
				}
				// Skip spring-based centre tug and limits in rigid mode
			} else {
				// Apply a single spring from the centre point to mouse (legacy elastic mode)
				let targetX = keyboardTugActive ? virtualCursorX : mouseX;
				let targetY = keyboardTugActive ? virtualCursorY : mouseY;
				let dx = targetX - centre.x;
				let dy = targetY - centre.y;
				let fx = MOUSE_SPRING_K * dx - (MOUSE_SPRING_DAMP * DRAG_DAMP_MULTIPLIER) * centre.vx;
				let fy = MOUSE_SPRING_K * dy - (MOUSE_SPRING_DAMP * DRAG_DAMP_MULTIPLIER) * centre.vy;
				let fmag = sqrt(fx*fx + fy*fy);
				let maxF = MOUSE_MAX_FORCE;
				if (fmag > maxF) { let s = maxF / (fmag + 1e-6); fx *= s; fy *= s; }
				// Blend: keep a portion at the hub, distribute the rest to all points
				let keepHub = (typeof CENTER_TUG_CENTER_SHARE !== 'undefined') ? CENTER_TUG_CENTER_SHARE : 0.35;
				keepHub = max(0, min(1, keepHub));
				let hubFx = fx * keepHub;
				let hubFy = fy * keepHub;
				centre.ax += hubFx;
				centre.ay += hubFy;
				let residualFx = fx - hubFx;
				let residualFy = fy - hubFy;
				let npts = blobDrag.points.length;
				if (npts < 1) npts = 1;
				let shareFx = residualFx / npts;
				let shareFy = residualFy / npts;
				for (var rp = 0; rp < blobDrag.points.length; rp++) {
					blobDrag.points[rp].ax += shareFx;
					blobDrag.points[rp].ay += shareFy;
				}

				// Soft radial limit: if hub moves too far from blob's geometric center, pull it back
			let limitR = max(1, blobDrag.innerRadius * CENTER_TUG_MAX_OFFSET_SCALE);
			let geomCx = 0, geomCy = 0;
			for (var gi = 0; gi < blobDrag.vertexCount; gi++) {
				geomCx += blobDrag.points[2 * gi + 1].x;
				geomCy += blobDrag.points[2 * gi + 1].y;
			}
			geomCx /= blobDrag.vertexCount;
			geomCy /= blobDrag.vertexCount;
			let rdx = centre.x - geomCx;
			let rdy = centre.y - geomCy;
			let rlen = sqrt(rdx*rdx + rdy*rdy) + 1e-6;
			if (rlen > limitR) {
				let nx = rdx / rlen, ny = rdy / rlen;
				let excess = rlen - limitR;
				// Restoring spring proportional to how far beyond limit the hub is
				let rfx = -CENTER_TUG_RESTORE_K * excess * nx;
				let rfy = -CENTER_TUG_RESTORE_K * excess * ny;
				// Add some radial damping relative to hub velocity along the extension
				let vRad = centre.vx * nx + centre.vy * ny;
				rfx += -CENTER_TUG_RESTORE_DAMP * vRad * nx;
				rfy += -CENTER_TUG_RESTORE_DAMP * vRad * ny;
				// Clamp to dedicated center-tug cap so tuning is visible even if global cap is high
				let rmag = sqrt(rfx*rfx + rfy*rfy);
				if (rmag > CENTER_TUG_FORCE_CAP) { let s2 = CENTER_TUG_FORCE_CAP / (rmag + 1e-6); rfx *= s2; rfy *= s2; }
				centre.ax += rfx;
				centre.ay += rfy;
			}

			// Hard boundary: if hub lies outside the rim polygon, push it inside
			let poly = [];
			for (var pi = 0; pi < blobDrag.vertexCount; pi++) {
				poly.push({ x: blobDrag.points[2 * pi + 1].x, y: blobDrag.points[2 * pi + 1].y });
			}
			let inside = pointInPolygon(centre.x, centre.y, poly);
			if (!inside) {
				// Find nearest rim segment and push the hub inward along its normal
				let minD = 1e9, nxB = 0, nyB = 0, closestDX = 0, closestDY = 0;
				for (var si = 0; si < blobDrag.vertexCount; si++) {
					let a = blobDrag.points[2 * si + 1];
					let b = blobDrag.points[(2 * ((si + 1) % blobDrag.vertexCount)) + 1];
					let ex = b.x - a.x, ey = b.y - a.y;
					let len = sqrt(ex*ex + ey*ey) + 1e-6;
					let px = centre.x - a.x, py = centre.y - a.y;
					let t = max(0, min(1, (px*ex + py*ey) / (len*len)));
					let cx = a.x + t * ex, cy = a.y + t * ey;
					let dxs = centre.x - cx, dys = centre.y - cy;
					let ds = sqrt(dxs*dxs + dys*dys);
					if (ds < minD) { minD = ds; nxB = (ey / len); nyB = (-ex / len); closestDX = dxs; closestDY = dys; }
				}
				// Normal points outward for positive area; we want inward, so negate if needed
				let area = computeOuterAreaForBlob(blobDrag);
				if (area > 0) { nxB = -nxB; nyB = -nyB; }
				// Scale boundary force by how far outside we are along the shortest vector
				let outsideDist = sqrt(closestDX*closestDX + closestDY*closestDY);
				let bfx = CENTER_TUG_BOUNDARY_K * outsideDist * nxB;
				let bfy = CENTER_TUG_BOUNDARY_K * outsideDist * nyB;
				let vAlong = centre.vx * nxB + centre.vy * nyB;
				bfx += -CENTER_TUG_BOUNDARY_DAMP * vAlong * nxB;
				bfy += -CENTER_TUG_BOUNDARY_DAMP * vAlong * nyB;
				let bmag = sqrt(bfx*bfx + bfy*bfy);
				if (bmag > CENTER_TUG_FORCE_CAP) { let sb = CENTER_TUG_FORCE_CAP / (bmag + 1e-6); bfx *= sb; bfy *= sb; }
				centre.ax += bfx;
				centre.ay += bfy;
			}
			}
		} else {
			applyDistributedMouseTugForBlob(blobDrag, draggedPointIndex);
		}
	}
	for (var b2 = 0; b2 < blobs.length; b2++) {
		let bp2 = blobs[b2].points;
		for (var i2 = 0; i2 < bp2.length; i2++) {
			let damp = 1.5;
			bp2[i2].vx += bp2[i2].ax * RATE;
			bp2[i2].vy += bp2[i2].ay * RATE;
			// Velocity clamp
			let spd = Math.sqrt(bp2[i2].vx*bp2[i2].vx + bp2[i2].vy*bp2[i2].vy);
			if (spd > MAX_POINT_SPEED) {
				let s = MAX_POINT_SPEED / (spd + 1e-9);
				bp2[i2].vx *= s;
				bp2[i2].vy *= s;
			}
			bp2[i2].vx *= exp(damp * -RATE);
			bp2[i2].vy *= exp(damp * -RATE);
			bp2[i2].x += bp2[i2].vx * RATE;
			bp2[i2].y += bp2[i2].vy * RATE;
		}
	}

	// After integration, check for obstacle penetration and split if needed
	if (ENABLE_BLOB_SPLIT_ON_PENETRATION) {
		maybeSplitPenetratedBlobs();
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

function computeBlobMassForBlob(blob) {
	let area = abs(computeOuterAreaForBlob(blob));
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
	// Pairwise obstacle repulsion (pre-integration forces)
	for (let i = 0; i < obstacles.length; i++) {
		for (let j = i + 1; j < obstacles.length; j++) {
			let a = obstacles[i], b = obstacles[j];
			let dx = b.x - a.x;
			let dy = b.y - a.y;
			let d2 = dx*dx + dy*dy;
			let rsumBand = a.r + b.r + OBSTACLE_CONTACT_BAND;
			if (d2 <= (rsumBand*rsumBand)) {
				let d = sqrt(d2) + 1e-6;
				let nx = dx / d, ny = dy / d;
				let overlap = (rsumBand + OBSTACLE_SEPARATION_EPS - d);
				let relVn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
				let fmag = OBSTACLE_CONTACT_REPEL_K * max(0, overlap) - OBSTACLE_CONTACT_DAMP * relVn;
				if (fmag > OBSTACLE_MAX_PAIR_FORCE) fmag = OBSTACLE_MAX_PAIR_FORCE;
				if (fmag < -OBSTACLE_MAX_PAIR_FORCE) fmag = -OBSTACLE_MAX_PAIR_FORCE;
				let fx = fmag * nx;
				let fy = fmag * ny;
				a.applyForce(-fx, -fy);
				b.applyForce( fx,  fy);
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
		if (typeof o.updateTrail === 'function') o.updateTrail();
	}
	// Post-integration positional separation to prevent overlap lingering
	for (let i = 0; i < obstacles.length; i++) {
		for (let j = i + 1; j < obstacles.length; j++) {
			let a = obstacles[i], b = obstacles[j];
			let dx = b.x - a.x;
			let dy = b.y - a.y;
			let d2 = dx*dx + dy*dy;
			let rsum = a.r + b.r + OBSTACLE_SEPARATION_EPS;
			if (d2 < (rsum*rsum)) {
				let d = sqrt(d2) + 1e-6;
				let nx = dx / d, ny = dy / d;
				let push = (rsum - d);
				let invMa = 1 / max(1e-6, a.mass);
				let invMb = 1 / max(1e-6, b.mass);
				let invSum = invMa + invMb;
				let ca = (invMa / invSum) * push;
				let cb = (invMb / invSum) * push;
				a.x -= nx * ca;
				a.y -= ny * ca;
				b.x += nx * cb;
				b.y += ny * cb;
			}
		}
	}
}

function updateObstacleDynamicsMulti() {
	if (obstacles.length === 0) return;
	for (var k = 0; k < obstacles.length; k++) {
		obstacles[k].ax = 0;
		obstacles[k].ay = 0;
		if (obstacleDensitySlider) {
			obstacles[k].mass = max(1, PI * obstacles[k].r * obstacles[k].r * OBSTACLE_DENSITY * obstacleDensitySlider.value());
		}
	}
	// Pairwise obstacle repulsion (pre-integration forces)
	for (let i = 0; i < obstacles.length; i++) {
		for (let j = i + 1; j < obstacles.length; j++) {
			let a = obstacles[i], b = obstacles[j];
			let dx = b.x - a.x;
			let dy = b.y - a.y;
			let d2 = dx*dx + dy*dy;
			let rsumBand = a.r + b.r + OBSTACLE_CONTACT_BAND;
			if (d2 <= (rsumBand*rsumBand)) {
				let d = sqrt(d2) + 1e-6;
				let nx = dx / d, ny = dy / d;
				let overlap = (rsumBand + OBSTACLE_SEPARATION_EPS - d);
				let relVn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
				let fmag = OBSTACLE_CONTACT_REPEL_K * max(0, overlap) - OBSTACLE_CONTACT_DAMP * relVn;
				if (fmag > OBSTACLE_MAX_PAIR_FORCE) fmag = OBSTACLE_MAX_PAIR_FORCE;
				if (fmag < -OBSTACLE_MAX_PAIR_FORCE) fmag = -OBSTACLE_MAX_PAIR_FORCE;
				let fx = fmag * nx;
				let fy = fmag * ny;
				a.applyForce(-fx, -fy);
				b.applyForce( fx,  fy);
			}
		}
	}
	let mu = frictionSlider ? frictionSlider.value() : 0;
	if (mu > 0) {
		for (var b = 0; b < blobs.length; b++) {
			let blob = blobs[b];
			let blobMass = computeBlobMassForBlob(blob);
			for (var i = 0; i < blob.vertexCount; i++) {
				let p = blob.points[2 * i + 1];
				let nearest = null;
				let minDist = 1e9;
				for (var j = 0; j < obstacles.length; j++) {
					let o = obstacles[j];
					let d = sqrt((p.x - o.x)*(p.x - o.x) + (p.y - o.y)*(p.y - o.y)) - o.r;
					if (d < minDist) { minDist = d; nearest = o; }
				}
				if (!nearest) continue;
				// If obstacle is attached, skip friction forces here
				if (nearest.attachedBlobIndex >= 0) continue;
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
	}
	// Attach obstacles to child blobs if they are inside
	for (var oidx = 0; oidx < obstacles.length; oidx++) {
		let o = obstacles[oidx];
		if (o.attachedBlobIndex >= 0) continue;
		for (var bb = 0; bb < blobs.length; bb++) {
			if (!blobs[bb].isChild) continue;
			if (obstaclePenetratesBlob(blobs[bb], o)) {
				o.attachedBlobIndex = bb;
				break;
			}
		}
	}
	for (var m = 0; m < obstacles.length; m++) {
		let o = obstacles[m];
		if (o.attachedBlobIndex >= 0 && o.attachedBlobIndex < blobs.length) {
			let cb = blobs[o.attachedBlobIndex];
			let ctr = cb.points[cb.points.length - 1];
			let kattach = 10.0;
			o.ax += kattach * (ctr.x - o.x);
			o.ay += kattach * (ctr.y - o.y);
		}
		o.vx += o.ax * RATE;
		o.vy += o.ay * RATE;
		o.vx *= exp(-OBSTACLE_DAMPING * RATE);
		o.vy *= exp(-OBSTACLE_DAMPING * RATE);
		o.x += o.vx * RATE;
		o.y += o.vy * RATE;
		if (typeof o.updateTrail === 'function') o.updateTrail();
	}
	// Post-integration positional separation to prevent overlap lingering
	for (let i = 0; i < obstacles.length; i++) {
		for (let j = i + 1; j < obstacles.length; j++) {
			let a = obstacles[i], b = obstacles[j];
			let dx = b.x - a.x;
			let dy = b.y - a.y;
			let d2 = dx*dx + dy*dy;
			let rsum = a.r + b.r + OBSTACLE_SEPARATION_EPS;
			if (d2 < (rsum*rsum)) {
				let d = sqrt(d2) + 1e-6;
				let nx = dx / d, ny = dy / d;
				let push = (rsum - d);
				let invMa = 1 / max(1e-6, a.mass);
				let invMb = 1 / max(1e-6, b.mass);
				let invSum = invMa + invMb;
				let ca = (invMa / invSum) * push;
				let cb = (invMb / invSum) * push;
				a.x -= nx * ca;
				a.y -= ny * ca;
				b.x += nx * cb;
				b.y += ny * cb;
			}
		}
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

function applyObstacleFrictionMulti() {
	if (!frictionSlider || obstacles.length === 0) return;
	let mu = frictionSlider.value();
	if (mu <= 0) return;
	for (var b = 0; b < blobs.length; b++) {
		let blob = blobs[b];
		for (var i = 0; i < blob.vertexCount; i++) {
			let p = blob.points[2 * i + 1];
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

// Multi-blob mouse tug helpers
function applyDistributedMouseTugForBlob(blob, baseIndex) {
    let isOuter = (baseIndex % 2) === 1;
    let v = Math.floor(baseIndex / 2);
    let indices = [];
    let shares = [];
    let totalShare = 0;
    for (let k = -DRAG_NEIGHBOR_RANGE; k <= DRAG_NEIGHBOR_RANGE; k++) {
        let baseW = Math.pow(DRAG_NEIGHBOR_DECAY, Math.abs(k));
        let j = (v + k + blob.vertexCount) % blob.vertexCount;
        let idxPrimary = isOuter ? (2 * j + 1) : (2 * j);
        let idxPair = isOuter ? (2 * j) : (2 * j + 1);
        let wPrimary = baseW;
        let wPair = DRAG_PAIR_WEIGHT * baseW;
        indices.push(idxPrimary); shares.push(wPrimary); totalShare += wPrimary;
        indices.push(idxPair);    shares.push(wPair);    totalShare += wPair;
    }
    if (totalShare < 1e-6) totalShare = 1;
    for (let s = 0; s < indices.length; s++) {
        applyMouseSpringNormalizedForBlob(blob, indices[s], shares[s], totalShare);
    }
}

function applyMouseSpringNormalizedForBlob(blob, pointIndex, share, totalShare) {
    let p = blob.points[pointIndex];
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

function computeOuterAreaForBlob(blob) {
	let area = 0;
	for (var i = 0; i < blob.vertexCount; i++) {
		let a = blob.points[2 * i + 1];
		let b = blob.points[(2 * ((i + 1) % blob.vertexCount)) + 1];
		area += a.x * b.y - b.x * a.y;
	}
	return 0.5 * area;
}

function pointInPolygon(x, y, polygonPoints) {
    // Ray casting on ordered polygon points
    let inside = false;
    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
        const xi = polygonPoints[i].x, yi = polygonPoints[i].y;
        const xj = polygonPoints[j].x, yj = polygonPoints[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-9) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function blobOuterPolygon(blob) {
    let poly = [];
    for (let i = 0; i < blob.vertexCount; i++) {
        poly.push({ x: blob.points[2 * i + 1].x, y: blob.points[2 * i + 1].y });
    }
    return poly;
}

function obstaclePenetratesBlob(blob, obstacle) {
    // Consider obstacle center inside the outer polygon as penetration heuristic
    const poly = blobOuterPolygon(blob);
    return pointInPolygon(obstacle.x, obstacle.y, poly);
}

function maybeSplitPenetratedBlobs() {
    const now = (typeof millis === 'function') ? (millis() / 1000.0) : 0;
    if (now - lastSplitAt < BLOB_SPLIT_COOLDOWN) return;
    for (let b = blobs.length - 1; b >= 0; b--) {
        const blob = blobs[b];
        if (blob.isChild) continue; // do not split children
        for (let o = 0; o < obstacles.length; o++) {
            if (obstaclePenetratesBlob(blob, obstacles[o])) {
                splitBlobAtObstacle(b, obstacles[o]);
                lastSplitAt = now;
                return; // one split per cooldown
            }
        }
    }
}

function splitBlobAtObstacle(blobIndex, obstacle) {
    const blob = blobs[blobIndex];
    const cx = obstacle.x;
    const cy = obstacle.y;
    const newInner = max(5, blob.innerRadius * BLOB_SPLIT_SCALE);
    const newOuter = max(newInner + 4, blob.outerRadius * BLOB_SPLIT_SCALE);
    const newVerts = max(8, Math.round(blob.vertexCount * BLOB_SPLIT_SCALE));

    // Compute axis perpendicular (90°) to obstacle's trajectory tangent
    let tvx = obstacle.vx;
    let tvy = obstacle.vy;
    let tvlen = sqrt(tvx*tvx + tvy*tvy);
    if (!(tvlen > 1e-6)) {
        // Fallback: vector from blob hub to obstacle
        let hub = blob.points[blob.points.length - 1];
        tvx = obstacle.x - hub.x;
        tvy = obstacle.y - hub.y;
        tvlen = sqrt(tvx*tvx + tvy*tvy);
    }
    if (!(tvlen > 1e-6)) {
        tvx = 1; tvy = 0; tvlen = 1; // final fallback
    }
    // Tangent unit
    let tux = tvx / tvlen;
    let tuy = tvy / tvlen;
    // Perpendicular unit (rotate 90°)
    let nux = -tuy;
    let nuy = tux;

    const offset = max(10, blob.outerRadius * 0.6 + obstacle.r * 0.3);
    const bx1 = cx + nux * offset;
    const by1 = cy + nuy * offset;
    const bx2 = cx - nux * offset;
    const by2 = cy - nuy * offset;

    let b1 = new BlobInstance(newInner, newOuter, newVerts, bx1, by1);
    b1.restOuterArea = b1.computeOuterArea();
    let b2 = new BlobInstance(newInner, newOuter, newVerts, bx2, by2);
    b2.restOuterArea = b2.computeOuterArea();
    b1.isChild = true;
    b2.isChild = true;
    blobs.splice(blobIndex, 1);
    blobs.push(b1);
    blobs.push(b2);
    draggingBlob = false;
    draggedPointIndex = -1;
    draggedBlobIndex = -1;
}

function applyPressureForcesForBlob(blob) {
	let area = computeOuterAreaForBlob(blob);
	let restArea = blob.restOuterArea || blob.computeOuterArea();
	if (restArea === 0) return;
	let rel = (restArea - area) / restArea;
	let k = rel > 0 ? PRESSURE_K * 1.25 : PRESSURE_K * 0.6;
	let dscaleP = getDensityScale();
	let pressure = (k * dscaleP) * rel;
	if (pressure === 0) return;
	let outwardSign = (area > 0) ? 1 : -1;
	for (var i = 0; i < blob.vertexCount; i++) {
		let a = blob.points[2 * i + 1];
		let b = blob.points[(2 * ((i + 1) % blob.vertexCount)) + 1];
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

function applyRimSelfRepulsionForBlob(blob) {
	for (var i = 0; i < blob.vertexCount; i++) {
		let ai = 2 * i + 1;
		let a = blob.points[ai];
		for (var j = i + 2; j < blob.vertexCount; j++) {
			if ((i === 0 && j === blob.vertexCount - 1)) continue;
			let bi = 2 * j + 1;
			let b = blob.points[bi];
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

function applyRimBendingForBlob(blob) {
	for (var i = 0; i < blob.vertexCount; i++) {
		let prev = (i - 1 + blob.vertexCount) % blob.vertexCount;
		let next = (i + 1) % blob.vertexCount;
		let pPrev = blob.points[2 * prev + 1];
		let pCurr = blob.points[2 * i + 1];
		let pNext = blob.points[2 * next + 1];
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

function applyRimVelocitySmoothingForBlob(blob) {
	for (var i = 0; i < blob.vertexCount; i++) {
		let prev = (i - 1 + blob.vertexCount) % blob.vertexCount;
		let next = (i + 1) % blob.vertexCount;
		let pPrev = blob.points[2 * prev + 1];
		let pCurr = blob.points[2 * i + 1];
		let pNext = blob.points[2 * next + 1];
		let vLapx = pPrev.vx + pNext.vx - 2 * pCurr.vx;
		let vLapy = pPrev.vy + pNext.vy - 2 * pCurr.vy;
		pCurr.vx += VISC_BEND_COEF * vLapx * RATE;
		pCurr.vy += VISC_BEND_COEF * vLapy * RATE;
	}
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
	// Optional centerX, centerY accepted via arguments[1], arguments[2] to preserve backward compatibility
	let centerX = arguments.length > 1 ? arguments[1] : undefined;
	let centerY = arguments.length > 2 ? arguments[2] : undefined;
	points = [];
	springs = [];
	num_points = newNumPoints;
	let cx = (typeof centerX === 'number') ? centerX : width/2;
	let cy = (typeof centerY === 'number') ? centerY : height/2;
	for (var i = 0; i < num_points; i++) {
		points.push(new Point(cx + inner_radius * cos(2 * PI * i / num_points), cy + inner_radius * sin(2 * PI * i / num_points)));
		points.push(new Point(cx + outer_radius * cos(2 * PI * i / num_points), cy + outer_radius * sin(2 * PI * i / num_points)));
	}
	points.push(new Point(cx, cy));
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


