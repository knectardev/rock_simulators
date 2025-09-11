let BLOB_FILL_GRAY = 0;

function drawSpokeToHub(x1, y1, cx, cy) {
	let dx = cx - x1;
	let dy = cy - y1;
	let len = sqrt(dx * dx + dy * dy);
	if (len < 1e-6) return;
	let ux = dx / len;
	let uy = dy / len;
	let hx = cx - ux * HUB_RADIUS;
	let hy = cy - uy * HUB_RADIUS;
	line(x1, y1, hx, hy);
}

function drawHub(cx, cy) {
	push();
	noStroke();
	fill(0, 200);
	circle(cx, cy, HUB_RADIUS * 2);
	pop();
}

function drawRimFill() {
	if (typeof blobs !== 'undefined' && blobs.length > 0) {
		for (var b = 0; b < blobs.length; b++) {
			let blob = blobs[b];
			push();
			noStroke();
			let a = (typeof window !== 'undefined' && typeof window.__blobFillAlpha === 'number') ? window.__blobFillAlpha : 204;
			fill(BLOB_FILL_GRAY, BLOB_FILL_GRAY, BLOB_FILL_GRAY, a);
			beginShape(TRIANGLE_STRIP);
			for (var i = 0; i <= blob.vertexCount; i++) {
				let idx = i % blob.vertexCount;
				let o = blob.points[2 * idx + 1];
				let inn = blob.points[2 * idx];
				vertex(o.x, o.y);
				vertex(inn.x, inn.y);
			}
			endShape(CLOSE);
			pop();
		}
	}
}

function drawSolidFill() {
	if (typeof blobs !== 'undefined' && blobs.length > 0) {
		for (var b = 0; b < blobs.length; b++) {
			let blob = blobs[b];
			push();
			noStroke();
			let a2 = (typeof window !== 'undefined' && typeof window.__blobFillAlpha === 'number') ? window.__blobFillAlpha : 204;
			fill(BLOB_FILL_GRAY, BLOB_FILL_GRAY, BLOB_FILL_GRAY, a2);
			beginShape();
			for (var i = 0; i < blob.vertexCount; i++) {
				let o = blob.points[2 * i + 1];
				vertex(o.x, o.y);
			}
			endShape(CLOSE);
			pop();
		}
	}
}

function drawForceVectors() {
	push();
	stroke(0, 255, 0);
	fill(0, 255, 0);
	if (typeof blobs !== 'undefined' && blobs.length > 0) {
		for (var b = 0; b < blobs.length; b++) {
			let blob = blobs[b];
			let c = blob.points[blob.points.length - 1];
			let sumFx = 0, sumFy = 0;
			for (var i = 0; i < blob.points.length; i++) {
				sumFx += blob.points[i].ax;
				sumFy += blob.points[i].ay;
			}
			blob.blobVisFx = (1 - BLOB_FORCE_EMA) * blob.blobVisFx + BLOB_FORCE_EMA * sumFx;
			blob.blobVisFy = (1 - BLOB_FORCE_EMA) * blob.blobVisFy + BLOB_FORCE_EMA * sumFy;
			let blen = sqrt(blob.blobVisFx*blob.blobVisFx + blob.blobVisFy*blob.blobVisFy);
			let bs = blen * FORCE_VIS_SCALE;
			if (bs > FORCE_VIS_MAX_LEN) bs = FORCE_VIS_MAX_LEN;
			let bux = blen > 0 ? (blob.blobVisFx / blen) : 0;
			let buy = blen > 0 ? (blob.blobVisFy / blen) : 0;
			let bx2 = c.x + bux * bs;
			let by2 = c.y + buy * bs;
			line(c.x, c.y, bx2, by2);
			let ahx1 = bx2 - bux * ARROW_HEAD_SIZE + (-buy) * (ARROW_HEAD_SIZE * 0.6);
			let ahy1 = by2 - buy * ARROW_HEAD_SIZE + (bux) * (ARROW_HEAD_SIZE * 0.6);
			let ahx2 = bx2 - bux * ARROW_HEAD_SIZE - (-buy) * (ARROW_HEAD_SIZE * 0.6);
			let ahy2 = by2 - buy * ARROW_HEAD_SIZE - (bux) * (ARROW_HEAD_SIZE * 0.6);
			line(bx2, by2, ahx1, ahy1);
			line(bx2, by2, ahx2, ahy2);
		}
	}
	for (var i = 0; i < obstacles.length; i++) {
		let o = obstacles[i];
		// Draw faint trail of obstacle motion
		if ((typeof trailCheckbox === 'undefined' ? OBSTACLE_TRAIL_ENABLED : trailCheckbox.checked()) && o.trail && o.trail.length > 1) {
			push();
			noStroke();
			fill(255, 255, 255, OBSTACLE_TRAIL_ALPHA);
			for (var t = 0; t < o.trail.length; t++) {
				circle(o.trail[t].x, o.trail[t].y, OBSTACLE_TRAIL_POINT_SIZE);
			}
			pop();
		}
		let ofx = o.ax * o.mass;
		let ofy = o.ay * o.mass;
		let olen = sqrt(ofx*ofx + ofy*ofy);
		let os = olen > 1e-6 ? (olen * FORCE_VIS_SCALE) : (sqrt(o.vx*o.vx + o.vy*o.vy) * VELOCITY_VIS_SCALE);
		if (os > FORCE_VIS_MAX_LEN) os = FORCE_VIS_MAX_LEN;
		let oux, ouy;
		if (olen > 1e-6) {
			oux = ofx / (olen + 1e-6);
			ouy = ofy / (olen + 1e-6);
		} else {
			let vlen = sqrt(o.vx*o.vx + o.vy*o.vy) + 1e-6;
			oux = o.vx / vlen;
			ouy = o.vy / vlen;
		}
		let ox2 = o.x + oux * os;
		let oy2 = o.y + ouy * os;
		line(o.x, o.y, ox2, oy2);
		let oahx1 = ox2 - oux * ARROW_HEAD_SIZE + (-ouy) * (ARROW_HEAD_SIZE * 0.6);
		let oahy1 = oy2 - ouy * ARROW_HEAD_SIZE + (oux) * (ARROW_HEAD_SIZE * 0.6);
		let oahx2 = ox2 - oux * ARROW_HEAD_SIZE - (-ouy) * (ARROW_HEAD_SIZE * 0.6);
		let oahy2 = oy2 - ouy * ARROW_HEAD_SIZE - (oux) * (ARROW_HEAD_SIZE * 0.6);
		line(ox2, oy2, oahx1, oahy1);
		line(ox2, oy2, oahx2, oahy2);
	}
	pop();
}


